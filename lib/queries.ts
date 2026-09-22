import { db, unwrap } from "./supabase";
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
} from "./types";

/**
 * Reference data — accounts, cards, buckets, categories, events.
 *
 * Small enough to load on every page, and loading it lets us resolve
 * transaction display names in JS instead of asking PostgREST to embed four
 * foreign keys that point at only two tables.
 */
export async function getRefData(): Promise<RefData> {
  const c = db();
  const [accounts, cards, buckets, categories, events] = await Promise.all([
    c.from("account_balances").select("*").order("sort_order"),
    c.from("card_balances").select("*").order("sort_order"),
    c.from("buckets").select("*").order("sort_order"),
    c.from("categories").select("*").order("sort_order"),
    c.from("events").select("*").order("start_date", { ascending: false }),
  ]);

  return {
    accounts: unwrap<AccountWithBalance[]>(accounts, "accounts").map((a) => ({
      ...a,
      opening_balance: toNumber(a.opening_balance),
      current_balance: toNumber(a.current_balance),
    })),
    cards: unwrap<CreditCardWithBalance[]>(cards, "cards").map((c2) => ({
      ...c2,
      credit_limit: c2.credit_limit === null ? null : toNumber(c2.credit_limit),
      opening_outstanding: toNumber(c2.opening_outstanding),
      current_outstanding: toNumber(c2.current_outstanding),
    })),
    buckets: unwrap<Bucket[]>(buckets, "buckets"),
    categories: unwrap<Category[]>(categories, "categories"),
    events: unwrap<TripEvent[]>(events, "events"),
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

export interface TxnPage {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getTransactions(filters: TxnFilters, ref: RefData): Promise<TxnPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? 50));

  let q = db().from("transactions").select("*", { count: "exact" });

  if (filters.from) q = q.gte("txn_date", filters.from);
  if (filters.to) q = q.lte("txn_date", filters.to);
  if (filters.bucketId) q = q.eq("bucket_id", filters.bucketId);
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
  if (filters.eventId) q = q.eq("event_id", filters.eventId);
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.reviewed !== undefined) q = q.eq("reviewed", filters.reviewed);
  if (filters.minAmount !== undefined) q = q.gte("amount", filters.minAmount);
  if (filters.maxAmount !== undefined) q = q.lte("amount", filters.maxAmount);

  // An account filter should include money that arrived there by transfer.
  if (filters.accountId) {
    q = q.or(`account_id.eq.${filters.accountId},dest_account_id.eq.${filters.accountId}`);
  }
  if (filters.cardId) {
    q = q.or(`credit_card_id.eq.${filters.cardId},dest_credit_card_id.eq.${filters.cardId}`);
  }

  if (filters.search) {
    const safe = filters.search.replace(/[%,()]/g, " ").trim();
    if (safe) q = q.or(`merchant.ilike.%${safe}%,note.ilike.%${safe}%`);
  }

  switch (filters.sort) {
    case "date_asc":
      q = q.order("txn_date", { ascending: true }).order("created_at", { ascending: true });
      break;
    case "amount_desc":
      q = q.order("amount", { ascending: false });
      break;
    case "amount_asc":
      q = q.order("amount", { ascending: true });
      break;
    default:
      q = q.order("txn_date", { ascending: false }).order("created_at", { ascending: false });
  }

  const fromIdx = (page - 1) * pageSize;
  const res = await q.range(fromIdx, fromIdx + pageSize - 1);
  if (res.error) throw new Error(`transactions: ${res.error.message}`);

  return {
    rows: decorate((res.data ?? []) as Transaction[], ref),
    total: res.count ?? 0,
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
 * Pulls the month's transactions once and aggregates in JS. At personal-finance
 * volumes (hundreds of rows a month) this is faster than six round trips, and
 * it keeps every total derived from exactly the same row set.
 */
export async function getDashboard(
  from: string,
  to: string,
  bucketId: string | null,
  ref: RefData,
  prev?: { from: string; to: string }
): Promise<DashboardData> {
  const c = db();

  let q = c.from("transactions").select("*").gte("txn_date", from).lte("txn_date", to);
  if (bucketId) q = q.eq("bucket_id", bucketId);

  const prevQuery = prev
    ? (() => {
        let p = c.from("transactions").select("type, amount, bucket_id").gte("txn_date", prev.from).lte("txn_date", prev.to);
        if (bucketId) p = p.eq("bucket_id", bucketId);
        return p;
      })()
    : null;

  const [cur, previous] = await Promise.all([q, prevQuery ?? Promise.resolve({ data: [], error: null })]);
  if (cur.error) throw new Error(`dashboard: ${cur.error.message}`);

  const txns = decorate((cur.data ?? []) as Transaction[], ref);

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
  for (const p of (previous.data ?? []) as { type: string; amount: number }[]) {
    if (p.type === "income") prevIncome += toNumber(p.amount);
    else if (p.type === "expense") prevExpense += toNumber(p.amount);
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
      .filter((c2) => c2.is_active)
      .reduce((s, c2) => s + c2.current_outstanding, 0),
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
  const res = await db()
    .from("transactions")
    .select("event_id, amount, type")
    .not("event_id", "is", null);
  if (res.error) throw new Error(`event totals: ${res.error.message}`);

  const totals = new Map<string, { total: number; count: number }>();
  for (const r of (res.data ?? []) as { event_id: string; amount: number; type: string }[]) {
    if (r.type === "transfer") continue;
    const cur = totals.get(r.event_id) ?? { total: 0, count: 0 };
    cur.total += toNumber(r.amount);
    cur.count += 1;
    totals.set(r.event_id, cur);
  }

  return ref.events.map((e) => ({
    ...e,
    total_spent: totals.get(e.id)?.total ?? 0,
    txn_count: totals.get(e.id)?.count ?? 0,
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
