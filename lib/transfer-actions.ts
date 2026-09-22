"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { toNumber } from "./format";
import type { ActionResult } from "./actions";

/**
 * Converting an ordinary transaction into a transfer.
 *
 * A statement only ever shows one side of a transfer, so the same movement
 * arrives as two unrelated rows in two different imports: a debit on the bank
 * and a credit on the card. A transfer here is a SINGLE row carrying both
 * source and destination, which is what makes double counting impossible — so
 * matching two rows necessarily merges them, and the counterpart row is
 * removed rather than left behind to be counted again.
 */

export interface Candidate {
  id: string;
  txn_date: string;
  amount: number;
  type: "expense" | "income";
  merchant: string | null;
  note: string | null;
  source_name: string;
  source_kind: "account" | "card";
  /** Days away from the row being converted; 0 is same day. */
  day_gap: number;
  exact_amount: boolean;
}

function splitTarget(value: string): { account_id: string | null; credit_card_id: string | null } {
  const [kind, id] = value.split(":");
  return kind === "card"
    ? { account_id: null, credit_card_id: id }
    : { account_id: id, credit_card_id: null };
}

function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes("txn_dest_rule"))
    return { ok: false, error: "A transfer needs exactly one destination." };
  if (raw.includes("txn_no_self"))
    return { ok: false, error: "A transfer needs two different accounts." };
  if (raw.includes("txn_one_source"))
    return { ok: false, error: "A transfer needs exactly one source account." };
  return { ok: false, error: raw };
}

/**
 * Rows that could be the other half of this one: the opposite direction, on a
 * different account, near the same date. Exact-amount matches rank first, then
 * near amounts — a card payment often posts a rupee or a day off.
 */
export async function findTransferCandidates(
  id: string,
  opts: { dayWindow?: number; anyAmount?: boolean } = {}
): Promise<{ ok: boolean; error?: string; candidates: Candidate[]; self?: Candidate }> {
  const sql = db();
  const dayWindow = Math.min(60, Math.max(1, opts.dayWindow ?? 7));

  try {
    const rows = (await sql`
      select t.id, t.txn_date::text as txn_date, t.amount::text as amount, t.type,
             t.merchant, t.note, t.account_id, t.credit_card_id,
             coalesce(a.name, c.name) as source_name
      from transactions t
      left join accounts     a on a.id = t.account_id
      left join credit_cards c on c.id = t.credit_card_id
      where t.id = ${id}
    `) as unknown as Record<string, string>[];

    const me = rows[0];
    if (!me) return { ok: false, error: "That transaction no longer exists.", candidates: [] };
    if (me.type === "transfer")
      return { ok: false, error: "That transaction is already a transfer.", candidates: [] };

    const want = me.type === "expense" ? "income" : "expense";
    const amount = toNumber(me.amount);
    // 1% either side, so 28,500 also finds 28,499 or 28,650.
    const lo = opts.anyAmount ? 0 : amount * 0.99;
    const hi = opts.anyAmount ? Number.MAX_SAFE_INTEGER : amount * 1.01;

    const found = (await sql.query(
      `select t.id, t.txn_date::text as txn_date, t.amount::text as amount, t.type,
              t.merchant, t.note, t.account_id, t.credit_card_id,
              coalesce(a.name, c.name) as source_name,
              abs(t.txn_date - $2::date) as day_gap
       from transactions t
       left join accounts     a on a.id = t.account_id
       left join credit_cards c on c.id = t.credit_card_id
       where t.id <> $1
         and t.type = $3
         and abs(t.txn_date - $2::date) <= $4
         and t.amount between $5 and $6
         -- exclude only rows sitting on the SAME account or card. A plain
         -- IS DISTINCT FROM would also drop every other card, because their
         -- account_id is null.
         and coalesce(t.account_id     = $7, false) is false
         and coalesce(t.credit_card_id = $8, false) is false
       order by (t.amount = $9) desc, abs(t.txn_date - $2::date), t.amount desc
       limit 25`,
      [
        id,
        me.txn_date,
        want,
        dayWindow,
        lo,
        hi,
        me.account_id ?? null,
        me.credit_card_id ?? null,
        amount,
      ]
    )) as unknown as Record<string, string>[];

    const shape = (r: Record<string, string>): Candidate => ({
      id: r.id,
      txn_date: r.txn_date,
      amount: toNumber(r.amount),
      type: r.type as "expense" | "income",
      merchant: r.merchant ?? null,
      note: r.note ?? null,
      source_name: r.source_name ?? "—",
      source_kind: r.credit_card_id ? "card" : "account",
      day_gap: Math.abs(Number(r.day_gap ?? 0)),
      exact_amount: Math.abs(toNumber(r.amount) - amount) < 0.005,
    });

    return {
      ok: true,
      candidates: found.map(shape),
      self: { ...shape(me), day_gap: 0, exact_amount: true },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not search for matches.",
      candidates: [],
    };
  }
}

/**
 * Turns `id` into a transfer.
 *
 * With `mergeWithId`, the two rows collapse into one: the debit leg supplies
 * the source, date and amount, the credit leg supplies the destination, and
 * the counterpart row is deleted. Both happen in one database transaction, so
 * the money can never briefly exist twice.
 *
 * Without it, `destination` names the other account directly — for when that
 * statement simply isn't in the app.
 */
export async function convertToTransfer(
  id: string,
  input: { destination?: string; mergeWithId?: string }
): Promise<ActionResult & { mergedAway?: string }> {
  const sql = db();

  try {
    const me = (
      (await sql`
        select id, txn_date::text as txn_date, amount::text as amount, type,
               account_id, credit_card_id, bucket_id, merchant, note
        from transactions where id = ${id}
      `) as unknown as Record<string, string | null>[]
    )[0];
    if (!me) throw new Error("That transaction no longer exists.");
    if (me.type === "transfer") throw new Error("That transaction is already a transfer.");

    // A transfer-kind category keeps the row honest in the category filters.
    const cats = (await sql`
      select id, name from categories where kind = 'transfer' order by sort_order
    `) as unknown as { id: string; name: string }[];

    let sourceAccount = me.account_id;
    let sourceCard = me.credit_card_id;
    let destAccount: string | null = null;
    let destCard: string | null = null;
    let txnDate = me.txn_date as string;
    let amount = toNumber(me.amount);
    let mergedAway: string | undefined;

    if (input.mergeWithId) {
      const other = (
        (await sql`
          select id, txn_date::text as txn_date, amount::text as amount, type,
                 account_id, credit_card_id
          from transactions where id = ${input.mergeWithId}
        `) as unknown as Record<string, string | null>[]
      )[0];
      if (!other) throw new Error("The matching transaction no longer exists.");
      if (other.type === "transfer") throw new Error("The matching transaction is already a transfer.");
      if (other.type === me.type)
        throw new Error("Both rows move money the same way — a transfer needs one out and one in.");

      // Money leaves the expense leg and lands on the income leg, whichever
      // row the user happened to start from.
      const debit = me.type === "expense" ? me : other;
      const credit = me.type === "expense" ? other : me;

      sourceAccount = debit.account_id;
      sourceCard = debit.credit_card_id;
      destAccount = credit.account_id;
      destCard = credit.credit_card_id;
      txnDate = debit.txn_date as string;
      amount = toNumber(debit.amount);

      if (
        (destAccount && destAccount === sourceAccount) ||
        (destCard && destCard === sourceCard)
      ) {
        throw new Error("Both rows are on the same account, so this isn't a transfer.");
      }

      mergedAway = other.id as string;
    } else {
      if (!input.destination) throw new Error("Choose where the money went.");
      const t = splitTarget(input.destination);
      destAccount = t.account_id;
      destCard = t.credit_card_id;

      if (
        (destAccount && destAccount === sourceAccount) ||
        (destCard && destCard === sourceCard)
      ) {
        throw new Error("A transfer needs two different accounts.");
      }

      // Starting from an income row means the money came IN here, so this
      // account is the destination and the chosen one is the source.
      if (me.type === "income") {
        [sourceAccount, destAccount] = [destAccount, sourceAccount];
        [sourceCard, destCard] = [destCard, sourceCard];
      }
    }

    const category =
      cats.find((c) => (destCard ? /card/i.test(c.name) : /bank|transfer/i.test(c.name)))?.id ??
      cats[0]?.id ??
      null;

    const writes = [
      sql.query(
        `update transactions set
           type = 'transfer', txn_date = $1, amount = $2,
           account_id = $3, credit_card_id = $4,
           dest_account_id = $5, dest_credit_card_id = $6,
           category_id = $7, reviewed = true
         where id = $8`,
        [txnDate, amount, sourceAccount, sourceCard, destAccount, destCard, category, id]
      ),
    ];
    if (mergedAway) {
      writes.push(sql.query(`delete from transactions where id = $1`, [mergedAway]));
    }

    await sql.transaction(writes);

    revalidatePath("/", "layout");
    return { ok: true, mergedAway };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Turns a transfer back into an ordinary transaction. The counterpart row that
 * was merged away is NOT restored — it no longer exists — so this leaves a
 * single expense or income on the source account.
 */
export async function unlinkTransfer(
  id: string,
  newType: "expense" | "income"
): Promise<ActionResult> {
  try {
    await db().query(
      `update transactions set
         type = $1, dest_account_id = null, dest_credit_card_id = null,
         category_id = null, reviewed = false
       where id = $2 and type = 'transfer'`,
      [newType, id]
    );
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
