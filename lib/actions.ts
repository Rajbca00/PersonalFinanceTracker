"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildSet, db } from "./db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
} from "./auth";
import type { TxnType } from "./types";

function refresh() {
  revalidatePath("/", "layout");
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || t === "none" ? null : t;
}

function num(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "acc:<uuid>" / "card:<uuid>" — one control, two possible targets. */
function splitSource(value: string | null): { account_id: string | null; credit_card_id: string | null } {
  if (!value) return { account_id: null, credit_card_id: null };
  const [kind, id] = value.split(":");
  return kind === "card"
    ? { account_id: null, credit_card_id: id }
    : { account_id: id, credit_card_id: null };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Turns Postgres constraint violations into something a person can act on.
 * The check constraints in schema.sql are the real guard rails; this just
 * translates them.
 */
function fail(e: unknown): ActionResult {
  const raw = e instanceof Error ? e.message : String(e);

  if (raw.includes("txn_dest_rule"))
    return { ok: false, error: "A transfer needs a destination, and only transfers can have one." };
  if (raw.includes("txn_one_source"))
    return { ok: false, error: "Choose exactly one account or card for this transaction." };
  if (raw.includes("txn_no_self"))
    return { ok: false, error: "A transfer needs two different accounts." };
  if (raw.includes("transactions_amount_check") || raw.includes("amount > 0"))
    return { ok: false, error: "Enter an amount greater than zero." };
  if (raw.includes("duplicate key") && raw.includes("name"))
    return { ok: false, error: "That name is already used." };
  if (raw.includes("violates foreign key"))
    return { ok: false, error: "That item is still referenced by something else." };

  return { ok: false, error: raw };
}

// ------------------------------------------------------------------ auth

export async function loginAction(_prev: unknown, fd: FormData): Promise<{ error?: string }> {
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/") || "/";

  if (!checkPassword(password)) {
    return { error: "Incorrect password." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------- transactions

export async function createTransaction(fd: FormData): Promise<ActionResult> {
  try {
    const type = (str(fd, "type") ?? "expense") as TxnType;
    const amount = num(fd, "amount");
    if (!amount || amount <= 0) throw new Error("Enter an amount greater than zero.");

    const source = splitSource(str(fd, "source"));
    if (!source.account_id && !source.credit_card_id) {
      throw new Error("Choose an account or card.");
    }

    const dest =
      type === "transfer"
        ? splitSource(str(fd, "dest"))
        : { account_id: null, credit_card_id: null };
    if (type === "transfer" && !dest.account_id && !dest.credit_card_id) {
      throw new Error("Choose where the money is going.");
    }

    const bucket_id = str(fd, "bucket_id");
    if (!bucket_id) throw new Error("Choose a bucket.");

    await db()`
      insert into transactions (
        txn_date, type, amount,
        account_id, credit_card_id, dest_account_id, dest_credit_card_id,
        bucket_id, category_id, event_id, merchant, note, reviewed
      ) values (
        ${str(fd, "txn_date")}, ${type}, ${amount},
        ${source.account_id}, ${source.credit_card_id},
        ${dest.account_id}, ${dest.credit_card_id},
        ${bucket_id}, ${str(fd, "category_id")}, ${str(fd, "event_id")},
        ${str(fd, "merchant")}, ${str(fd, "note")}, true
      )
    `;

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTransaction(id: string, fd: FormData): Promise<ActionResult> {
  try {
    const type = (str(fd, "type") ?? "expense") as TxnType;
    const amount = num(fd, "amount");
    if (!amount || amount <= 0) throw new Error("Enter an amount greater than zero.");

    const source = splitSource(str(fd, "source"));
    const dest =
      type === "transfer"
        ? splitSource(str(fd, "dest"))
        : { account_id: null, credit_card_id: null };

    const bucket_id = str(fd, "bucket_id");
    if (!bucket_id) throw new Error("Choose a bucket.");

    await db()`
      update transactions set
        txn_date            = ${str(fd, "txn_date")},
        type                = ${type},
        amount              = ${amount},
        account_id          = ${source.account_id},
        credit_card_id      = ${source.credit_card_id},
        dest_account_id     = ${dest.account_id},
        dest_credit_card_id = ${dest.credit_card_id},
        bucket_id           = ${bucket_id},
        category_id         = ${str(fd, "category_id")},
        event_id            = ${str(fd, "event_id")},
        merchant            = ${str(fd, "merchant")},
        note                = ${str(fd, "note")}
      where id = ${id}
    `;

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const TXN_PATCHABLE = [
  "note",
  "merchant",
  "category_id",
  "bucket_id",
  "event_id",
  "amount",
  "txn_date",
  "reviewed",
] as const;

/** Inline edits from the transaction list — one field, no form round trip. */
export async function patchTransaction(
  id: string,
  patch: Partial<{
    note: string | null;
    merchant: string | null;
    category_id: string | null;
    bucket_id: string;
    event_id: string | null;
    amount: number;
    txn_date: string;
    reviewed: boolean;
  }>
): Promise<ActionResult> {
  try {
    const { clause, params } = buildSet(patch, TXN_PATCHABLE);
    await db().query(
      `update transactions set ${clause} where id = $${params.length + 1}`,
      [...params, id]
    );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    await db()`delete from transactions where id = ${id}`;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ bulk

export type BulkAction =
  | { kind: "category"; value: string | null }
  | { kind: "bucket"; value: string }
  | { kind: "source"; value: string }
  | { kind: "event"; value: string | null }
  | { kind: "type"; value: TxnType }
  | { kind: "note"; value: string }
  | { kind: "reviewed"; value: boolean }
  | { kind: "delete" };

export async function bulkApply(ids: string[], action: BulkAction): Promise<ActionResult> {
  try {
    if (ids.length === 0) throw new Error("Nothing selected.");
    const sql = db();

    if (action.kind === "delete") {
      await sql`delete from transactions where id = any(${ids}::uuid[])`;
      refresh();
      return { ok: true };
    }

    let patch: Record<string, unknown>;
    switch (action.kind) {
      case "category":
        patch = { category_id: action.value };
        break;
      case "bucket":
        patch = { bucket_id: action.value };
        break;
      case "event":
        patch = { event_id: action.value };
        break;
      case "note":
        patch = { note: action.value };
        break;
      case "reviewed":
        patch = { reviewed: action.value };
        break;
      case "source": {
        const s = splitSource(action.value);
        patch = { account_id: s.account_id, credit_card_id: s.credit_card_id };
        break;
      }
      case "type": {
        // Moving rows out of 'transfer' has to clear the destination, or the
        // txn_dest_rule check constraint rejects the whole update.
        patch =
          action.value === "transfer"
            ? { type: action.value }
            : { type: action.value, dest_account_id: null, dest_credit_card_id: null };
        break;
      }
    }

    const allowed = [...TXN_PATCHABLE, "account_id", "credit_card_id", "type",
      "dest_account_id", "dest_credit_card_id"];
    const { clause, params } = buildSet(patch, allowed);

    await sql.query(
      `update transactions set ${clause} where id = any($${params.length + 1}::uuid[])`,
      [...params, ids]
    );

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------------- accounts

export async function saveAccount(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required.");

    const type = str(fd, "type") ?? "bank";
    const institution = str(fd, "institution");
    const opening = num(fd, "opening_balance") ?? 0;
    const active = fd.get("is_active") === "on";

    if (id) {
      await db()`
        update accounts set name = ${name}, type = ${type},
          institution = ${institution}, opening_balance = ${opening},
          is_active = ${active}
        where id = ${id}
      `;
    } else {
      await db()`
        insert into accounts (name, type, institution, opening_balance, is_active)
        values (${name}, ${type}, ${institution}, ${opening}, ${active})
      `;
    }

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCard(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required.");

    const provider = str(fd, "provider");
    const limit = num(fd, "credit_limit");
    const opening = num(fd, "opening_outstanding") ?? 0;
    const active = fd.get("is_active") === "on";

    if (id) {
      await db()`
        update credit_cards set name = ${name}, provider = ${provider},
          credit_limit = ${limit}, opening_outstanding = ${opening},
          is_active = ${active}
        where id = ${id}
      `;
    } else {
      await db()`
        insert into credit_cards (name, provider, credit_limit, opening_outstanding, is_active)
        values (${name}, ${provider}, ${limit}, ${opening}, ${active})
      `;
    }

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAccount(id: string, kind: "account" | "card"): Promise<ActionResult> {
  try {
    if (kind === "card") await db()`delete from credit_cards where id = ${id}`;
    else await db()`delete from accounts where id = ${id}`;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --------------------------------------------------------------- buckets

export async function saveBucket(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required.");
    const color = str(fd, "color") ?? "slate";

    if (id) {
      await db()`update buckets set name = ${name}, color = ${color} where id = ${id}`;
    } else {
      await db()`insert into buckets (name, color) values (${name}, ${color})`;
    }

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBucket(id: string): Promise<ActionResult> {
  try {
    await db()`delete from buckets where id = ${id}`;
    refresh();
    return { ok: true };
  } catch (e) {
    // bucket_id is NOT NULL on transactions, so the FK is restrict-on-delete
    const raw = e instanceof Error ? e.message : String(e);
    if (raw.includes("violates foreign key")) {
      return {
        ok: false,
        error: "This bucket still has transactions. Move them to another bucket first.",
      };
    }
    return fail(e);
  }
}

// ------------------------------------------------------------ categories

export async function saveCategory(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required.");
    const kind = str(fd, "kind") ?? "expense";
    const icon = str(fd, "icon") ?? "tag";

    if (id) {
      await db()`update categories set name = ${name}, kind = ${kind}, icon = ${icon} where id = ${id}`;
    } else {
      await db()`insert into categories (name, kind, icon) values (${name}, ${kind}, ${icon})`;
    }

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    // category_id is ON DELETE SET NULL — transactions survive, uncategorized.
    await db()`delete from categories where id = ${id}`;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- events

export async function saveEvent(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required.");

    const start = str(fd, "start_date");
    const end = str(fd, "end_date");
    if (start && end && end < start) throw new Error("The end date is before the start date.");

    const description = str(fd, "description");
    const bucket_id = str(fd, "bucket_id");

    if (id) {
      await db()`
        update events set name = ${name}, start_date = ${start}, end_date = ${end},
          description = ${description}, bucket_id = ${bucket_id}
        where id = ${id}
      `;
    } else {
      await db()`
        insert into events (name, start_date, end_date, description, bucket_id)
        values (${name}, ${start}, ${end}, ${description}, ${bucket_id})
      `;
    }

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  try {
    await db()`delete from events where id = ${id}`;
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
