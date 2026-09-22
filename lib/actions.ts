"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./supabase";
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

function fail(e: unknown): ActionResult {
  const message = e instanceof Error ? e.message : "Something went wrong";
  return { ok: false, error: message };
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

    const dest = type === "transfer" ? splitSource(str(fd, "dest")) : { account_id: null, credit_card_id: null };
    if (type === "transfer" && !dest.account_id && !dest.credit_card_id) {
      throw new Error("Choose where the money is going.");
    }
    if (
      type === "transfer" &&
      ((dest.account_id && dest.account_id === source.account_id) ||
        (dest.credit_card_id && dest.credit_card_id === source.credit_card_id))
    ) {
      throw new Error("A transfer needs two different accounts.");
    }

    const bucket_id = str(fd, "bucket_id");
    if (!bucket_id) throw new Error("Choose a bucket.");

    const res = await db().from("transactions").insert({
      txn_date: str(fd, "txn_date"),
      type,
      amount,
      account_id: source.account_id,
      credit_card_id: source.credit_card_id,
      dest_account_id: dest.account_id,
      dest_credit_card_id: dest.credit_card_id,
      bucket_id,
      category_id: str(fd, "category_id"),
      event_id: str(fd, "event_id"),
      merchant: str(fd, "merchant"),
      note: str(fd, "note"),
      reviewed: true,
    });
    if (res.error) throw new Error(res.error.message);

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
    const dest = type === "transfer" ? splitSource(str(fd, "dest")) : { account_id: null, credit_card_id: null };

    const bucket_id = str(fd, "bucket_id");
    if (!bucket_id) throw new Error("Choose a bucket.");

    const res = await db()
      .from("transactions")
      .update({
        txn_date: str(fd, "txn_date"),
        type,
        amount,
        account_id: source.account_id,
        credit_card_id: source.credit_card_id,
        dest_account_id: dest.account_id,
        dest_credit_card_id: dest.credit_card_id,
        bucket_id,
        category_id: str(fd, "category_id"),
        event_id: str(fd, "event_id"),
        merchant: str(fd, "merchant"),
        note: str(fd, "note"),
      })
      .eq("id", id);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

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
    const res = await db().from("transactions").update(patch).eq("id", id);
    if (res.error) throw new Error(res.error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  try {
    const res = await db().from("transactions").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
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
    const c = db();

    if (action.kind === "delete") {
      const res = await c.from("transactions").delete().in("id", ids);
      if (res.error) throw new Error(res.error.message);
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

    const res = await c.from("transactions").update(patch).in("id", ids);
    if (res.error) throw new Error(res.error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------------- accounts

export async function saveAccount(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: str(fd, "name"),
      type: str(fd, "type") ?? "bank",
      institution: str(fd, "institution"),
      opening_balance: num(fd, "opening_balance") ?? 0,
      is_active: fd.get("is_active") === "on",
    };
    if (!payload.name) throw new Error("Name is required.");

    const c = db();
    const res = id
      ? await c.from("accounts").update(payload).eq("id", id)
      : await c.from("accounts").insert(payload);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCard(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: str(fd, "name"),
      provider: str(fd, "provider"),
      credit_limit: num(fd, "credit_limit"),
      opening_outstanding: num(fd, "opening_outstanding") ?? 0,
      is_active: fd.get("is_active") === "on",
    };
    if (!payload.name) throw new Error("Name is required.");

    const c = db();
    const res = id
      ? await c.from("credit_cards").update(payload).eq("id", id)
      : await c.from("credit_cards").insert(payload);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAccount(id: string, kind: "account" | "card"): Promise<ActionResult> {
  try {
    const table = kind === "card" ? "credit_cards" : "accounts";
    const res = await db().from(table).delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --------------------------------------------------------------- buckets

export async function saveBucket(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: str(fd, "name"),
      color: str(fd, "color") ?? "slate",
    };
    if (!payload.name) throw new Error("Name is required.");

    const c = db();
    const res = id
      ? await c.from("buckets").update(payload).eq("id", id)
      : await c.from("buckets").insert(payload);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBucket(id: string): Promise<ActionResult> {
  try {
    const res = await db().from("buckets").delete().eq("id", id);
    if (res.error) {
      // bucket_id is NOT NULL on transactions, so the FK is restrict-on-delete
      throw new Error(
        res.error.message.includes("violates foreign key")
          ? "This bucket still has transactions. Move them to another bucket first."
          : res.error.message
      );
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------ categories

export async function saveCategory(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: str(fd, "name"),
      kind: str(fd, "kind") ?? "expense",
      icon: str(fd, "icon") ?? "tag",
    };
    if (!payload.name) throw new Error("Name is required.");

    const c = db();
    const res = id
      ? await c.from("categories").update(payload).eq("id", id)
      : await c.from("categories").insert(payload);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  try {
    // category_id is ON DELETE SET NULL — transactions survive, uncategorized.
    const res = await db().from("categories").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- events

export async function saveEvent(id: string | null, fd: FormData): Promise<ActionResult> {
  try {
    const payload = {
      name: str(fd, "name"),
      start_date: str(fd, "start_date"),
      end_date: str(fd, "end_date"),
      description: str(fd, "description"),
      bucket_id: str(fd, "bucket_id"),
    };
    if (!payload.name) throw new Error("Name is required.");
    if (payload.start_date && payload.end_date && payload.end_date < payload.start_date) {
      throw new Error("The end date is before the start date.");
    }

    const c = db();
    const res = id
      ? await c.from("events").update(payload).eq("id", id)
      : await c.from("events").insert(payload);
    if (res.error) throw new Error(res.error.message);

    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  try {
    const res = await db().from("events").delete().eq("id", id);
    if (res.error) throw new Error(res.error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
