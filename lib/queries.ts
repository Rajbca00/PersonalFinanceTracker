import { db } from "./db";
import { toNumber } from "./format";
import type {
  AccountWithBalance,
  Bucket,
  Category,
  CreditCardWithBalance,
  EventWithTotals,
  RefData,
  Transaction,
  TransactionRow,
  TripEvent,
  TxnFilters,
  TxnType,
} from "./types";

/**
 * Dates and timestamps are cast to text in SQL rather than letting the driver
 * hand back JS Date objects. The app treats a transaction date as a calendar
 * day ("2026-09-22"), and a Date would drag a timezone along with it — which
 * is exactly how transactions end up in the wrong month.
 *
 * numeric columns arrive as strings (Postgres numerics don't fit a JS number
 * safely in general), so every one goes through toNumber().
 */
const TXN_COLS = `
  id, txn_date::text as txn_date, type, amount,
  account_id, credit_card_id, dest_account_id, dest_credit_card_id,
  bucket_id, category_id, event_id,
  merchant, note, reviewed, import_batch_id, external_ref,
  created_at::text as created_at, updated_at::text as updated_at
`;

export async function getRefData(): Promise<RefData> {
  const sql = db();

  // One round trip for all five, rather than five HTTP requests.
  const [accounts, cards, buckets, categories, events] = await sql.transaction([
    sql`select id, user_id, name, type, institution, opening_balance,
               is_active, sort_order, current_balance
        from account_balances order by sort_order, name`,
    sql`select id, user_id, name, provider, credit_limit, opening_outstanding,
               statement_day, due_day, is_active, sort_order, current_outstanding
        from card_balances order by sort_order, name`,
    sql`select id, name, color, sort_order, is_archived
        from buckets order by sort_order, name`,
    sql`select id, name, kind, icon, is_system, is_archived, sort_order
        from categories order by sort_order, name`,
    sql`select id, name, start_date::text as start_date, end_date::text as end_date,
               description, bucket_id
        from events order by start_date desc nulls last, name`,
  ]);

  return {
    accounts: (accounts as Record<string, unknown>[]).map((a) => ({
      ...(a as unknown as AccountWithBalance),
      opening_balance: toNumber(a.opening_balance as string),
      current_balance: toNumber(a.current_balance as string),
    })),
    cards: (cards as Record<string, unknown>[]).map((c) => ({
      ...(c as unknown as CreditCardWithBalance),
      credit_limit: c.credit_limit === null ? null : toNumber(c.credit_limit as string),
      opening_outstanding: toNumber(c.opening_outstanding as string),
      current_outstanding: toNumber(c.current_outstanding as string),
    })),
    buckets: buckets as unknown as Bucket[],
    categories: categories as unknown as Category[],
    events: events as unknown as TripEvent[],
  };
}

/** Attaches the display names the tables and cards need. */
export function decorate(txns: Transaction[], ref: RefData): TransactionRow[] {
  const acct = new Map(ref.accounts.map((a) => [a.id, a.name]));
  const card = new Map(ref.cards.map((c) => [c.id, c.name]));
  const bucket = new Map(ref.buckets.map((b) => [b.id, b.name]));
  const cat = new Map(ref.categories.map((c) => [c.id, c.name]));
  const evt = new Map(ref.events.map((e) => [e.id, e.name]));

  return txns.map((t) => ({
    ...t,
    amount: toNumber(t.amount),
    source_name: (t.account_id ? acct.get(t.account_id) : card.get(t.credit_card_id!)) ?? "—",
    dest_name: t.dest_account_id
      ? acct.get(t.dest_account_id) ?? null
      : t.dest_credit_card_id
        ? card.get(t.dest_credit_card_id) ?? null
        : null,
    bucket_name: bucket.get(t.bucket_id) ?? "—",
    category_name: t.category_id ? cat.get(t.category_id) ?? null : null,
    event_name: t.event_id ? evt.get(t.event_id) ?? null : null,
  }));
}

/** Turns filters into a WHERE clause plus bound parameters. */
function whereFor(f: TxnFilters): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (f.from) parts.push(`txn_date >= ${p(f.from)}`);
  if (f.to) parts.push(`txn_date <= ${p(f.to)}`);
  if (f.bucketId) parts.push(`bucket_id = ${p(f.bucketId)}`);
  if (f.categoryId) parts.push(`category_id = ${p(f.categoryId)}`);
  if (f.eventId) parts.push(`event_id = ${p(f.eventId)}`);
  if (f.type) parts.push(`type = ${p(f.type)}`);
  if (f.reviewed !== undefined) parts.push(`reviewed = ${p(f.reviewed)}`);

  // Rows imported from a statement that look like a movement between the
  // user's own accounts, but are still counted as spending.
  if (f.needsTransferReview) {
    parts.push(
      `type <> 'transfer' and category_id in (select id from categories where kind = 'transfer')`
    );
  }
  if (f.minAmount !== undefined) parts.push(`amount >= ${p(f.minAmount)}`);
  if (f.maxAmount !== undefined) parts.push(`amount <= ${p(f.maxAmount)}`);

  // An account filter should include money that arrived there by transfer.
  if (f.accountId) {
    const v = p(f.accountId);
    parts.push(`(account_id = ${v} or dest_account_id = ${v})`);
  }
  if (f.cardId) {
    const v = p(f.cardId);
    parts.push(`(credit_card_id = ${v} or dest_credit_card_id = ${v})`);
  }

  if (f.search) {
    const term = `%${f.search.trim()}%`;
    const v = p(term);
    parts.push(`(merchant ilike ${v} or note ilike ${v})`);
  }

  return {
    clause: parts.length ? `where ${parts.join(" and ")}` : "",
    params,
  };
}

/** Whitelisted — never interpolate a sort value from the query string. */
const ORDER: Record<string, string> = {
  date_desc: "txn_date desc, created_at desc",
  date_asc: "txn_date asc, created_at asc",
  amount_desc: "amount desc, txn_date desc",
  amount_asc: "amount asc, txn_date desc",
};

export interface TxnPage {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getTransactions(filters: TxnFilters, ref: RefData): Promise<TxnPage> {
  const sql = db();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? 50));

  const { clause, params } = whereFor(filters);
  const order = ORDER[filters.sort ?? "date_desc"] ?? ORDER.date_desc;

  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  // Count and page in one round trip, so the total can't disagree with the rows.
  const [rows, counted] = await sql.transaction([
    sql.query(
      `select ${TXN_COLS} from transactions ${clause}
       order by ${order} limit $${limitIdx} offset $${offsetIdx}`,
      [...params, pageSize, (page - 1) * pageSize]
    ),
    sql.query(`select count(*)::text as total from transactions ${clause}`, params),
  ]);

  return {
    rows: decorate(rows as unknown as Transaction[], ref),
    total: toNumber((counted as { total: string }[])[0]?.total),
    page,
    pageSize,
  };
}

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------

export interface Slice {
  id: string;
  label: string;
  value: number;
}

export interface BucketRow {
  id: string;
  name: string;
  income: number;
  expense: number;
  net: number;
}

export interface DashboardData {
  income: number;
  expense: number;
  net: number;
  txnCount: number;
  totalBalance: number;
  totalOutstanding: number;
  byCategory: Slice[];
  byBucket: BucketRow[];
  bySource: Slice[];
  daily: { date: string; expense: number; income: number }[];
  events: { id: string; name: string; total: number; count: number }[];
  prevExpense: number;
  prevIncome: number;
  topMerchants: Slice[];
}

/**
 * Pulls the period's transactions once and aggregates in JS. At personal
 * finance volumes (hundreds of rows a month) this beats six round trips, and
 * every total ends up derived from exactly the same row set.
 */
export async function getDashboard(
  from: string,
  to: string,
  bucketId: string | null,
  ref: RefData,
  prev?: { from: string; to: string }
): Promise<DashboardData> {
  const sql = db();

  const curParams: unknown[] = [from, to];
  let curWhere = "txn_date >= $1 and txn_date <= $2";
  if (bucketId) {
    curParams.push(bucketId);
    curWhere += ` and bucket_id = $${curParams.length}`;
  }

  const prevParams: unknown[] = prev ? [prev.from, prev.to] : [];
  let prevWhere = "txn_date >= $1 and txn_date <= $2";
  if (prev && bucketId) {
    prevParams.push(bucketId);
    prevWhere += ` and bucket_id = $${prevParams.length}`;
  }

  const queries = [
    sql.query(`select ${TXN_COLS} from transactions where ${curWhere}`, curParams),
  ];
  if (prev) {
    queries.push(
      sql.query(
        `select type, sum(amount)::text as total from transactions
         where ${prevWhere} and type <> 'transfer' group by type`,
        prevParams
      )
    );
  }

  const results = await sql.transaction(queries);
  const txns = decorate(results[0] as unknown as Transaction[], ref);
  const prevRows = (results[1] ?? []) as { type: TxnType; total: string }[];

  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, Slice>();
  const bySource = new Map<string, Slice>();
  const byMerchant = new Map<string, Slice>();
  const byBucket = new Map<string, BucketRow>();
  const byEvent = new Map<string, { id: string; name: string; total: number; count: number }>();
  const daily = new Map<string, { date: string; expense: number; income: number }>();

  for (const b of ref.buckets) {
    if (bucketId && b.id !== bucketId) continue;
    byBucket.set(b.id, { id: b.id, name: b.name, income: 0, expense: 0, net: 0 });
  }

  for (const t of txns) {
    // Transfers move money between the user's own accounts. They are never
    // income or expense — this is the single place that rule is enforced.
    if (t.type === "transfer") continue;

    const day = daily.get(t.txn_date) ?? { date: t.txn_date, expense: 0, income: 0 };

    if (t.type === "income") {
      income += t.amount;
      day.income += t.amount;
      const b = byBucket.get(t.bucket_id);
      if (b) b.income += t.amount;
    } else {
      expense += t.amount;
      day.expense += t.amount;
      const b = byBucket.get(t.bucket_id);
      if (b) b.expense += t.amount;

      const catKey = t.category_id ?? "uncategorized";
      const cat = byCategory.get(catKey) ?? {
        id: catKey,
        label: t.category_name ?? "Uncategorized",
        value: 0,
      };
      cat.value += t.amount;
      byCategory.set(catKey, cat);

      const srcKey = t.account_id ?? t.credit_card_id ?? "unknown";
      const src = bySource.get(srcKey) ?? { id: srcKey, label: t.source_name, value: 0 };
      src.value += t.amount;
      bySource.set(srcKey, src);

      const mKey = (t.merchant ?? "Unknown").trim() || "Unknown";
      const m = byMerchant.get(mKey) ?? { id: mKey, label: mKey, value: 0 };
      m.value += t.amount;
      byMerchant.set(mKey, m);

      if (t.event_id) {
        const e = byEvent.get(t.event_id) ?? {
          id: t.event_id,
          name: t.event_name ?? "Event",
          total: 0,
          count: 0,
        };
        e.total += t.amount;
        e.count += 1;
        byEvent.set(t.event_id, e);
      }
    }

    daily.set(t.txn_date, day);
  }

  for (const b of byBucket.values()) b.net = b.income - b.expense;

  let prevIncome = 0;
  let prevExpense = 0;
  for (const r of prevRows) {
    if (r.type === "income") prevIncome = toNumber(r.total);
    else if (r.type === "expense") prevExpense = toNumber(r.total);
  }

  return {
    income,
    expense,
    net: income - expense,
    txnCount: txns.length,
    totalBalance: ref.accounts
      .filter((a) => a.is_active)
      .reduce((s, a) => s + a.current_balance, 0),
    totalOutstanding: ref.cards
      .filter((c) => c.is_active)
      .reduce((s, c) => s + c.current_outstanding, 0),
    byCategory: [...byCategory.values()].sort((a, b) => b.value - a.value),
    byBucket: [...byBucket.values()].sort((a, b) => b.expense - a.expense),
    bySource: [...bySource.values()].sort((a, b) => b.value - a.value),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    events: [...byEvent.values()].sort((a, b) => b.total - a.total),
    prevIncome,
    prevExpense,
    topMerchants: [...byMerchant.values()].sort((a, b) => b.value - a.value).slice(0, 8),
  };
}

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------

export async function getEventsWithTotals(ref: RefData): Promise<EventWithTotals[]> {
  const sql = db();

  const rows = (await sql`
    select event_id,
           sum(amount)::text as total,
           count(*)::text    as count
    from transactions
    where event_id is not null and type <> 'transfer'
    group by event_id
  `) as unknown as { event_id: string; total: string; count: string }[];

  const totals = new Map(rows.map((r) => [r.event_id, r]));

  return ref.events.map((e) => ({
    ...e,
    total_spent: toNumber(totals.get(e.id)?.total),
    txn_count: toNumber(totals.get(e.id)?.count),
  }));
}

/** Events that overlap the given window — used for the dashboard highlight. */
export function eventsInRange(events: TripEvent[], from: string, to: string): TripEvent[] {
  return events.filter((e) => {
    const start = e.start_date ?? e.end_date;
    const end = e.end_date ?? e.start_date;
    if (!start || !end) return false;
    return start <= to && end >= from;
  });
}
