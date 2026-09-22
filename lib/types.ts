export type TxnType = "expense" | "income" | "transfer";
export type CategoryKind = TxnType;
export type AccountType = "bank" | "savings" | "cash" | "wallet";

export interface Bucket {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  is_system: boolean;
  is_archived: boolean;
  sort_order: number;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  opening_balance: number;
  is_active: boolean;
  sort_order: number;
}

export interface AccountWithBalance extends Account {
  current_balance: number;
}

export interface CreditCard {
  id: string;
  name: string;
  provider: string | null;
  credit_limit: number | null;
  opening_outstanding: number;
  statement_day: number | null;
  due_day: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface CreditCardWithBalance extends CreditCard {
  current_outstanding: number;
}

export interface TripEvent {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  bucket_id: string | null;
}

export interface EventWithTotals extends TripEvent {
  total_spent: number;
  txn_count: number;
}

export interface Transaction {
  id: string;
  txn_date: string;
  type: TxnType;
  amount: number;
  account_id: string | null;
  credit_card_id: string | null;
  dest_account_id: string | null;
  dest_credit_card_id: string | null;
  bucket_id: string;
  category_id: string | null;
  event_id: string | null;
  merchant: string | null;
  note: string | null;
  reviewed: boolean;
  import_batch_id: string | null;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}

/** A transaction joined with the display names the UI needs. */
export interface TransactionRow extends Transaction {
  source_name: string;
  dest_name: string | null;
  bucket_name: string;
  category_name: string | null;
  event_name: string | null;
}

/** Everything the pickers need, loaded once per page. */
export interface RefData {
  accounts: AccountWithBalance[];
  cards: CreditCardWithBalance[];
  buckets: Bucket[];
  categories: Category[];
  events: TripEvent[];
}

export interface TxnFilters {
  from?: string;
  to?: string;
  bucketId?: string;
  categoryId?: string;
  eventId?: string;
  accountId?: string;
  cardId?: string;
  type?: TxnType;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  reviewed?: boolean;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  page?: number;
  pageSize?: number;
}

/** A CSV row after parsing and AI/rule categorization, before import. */
export interface StagedRow {
  key: string;
  txn_date: string;
  merchant: string;
  rawDescription: string;
  amount: number;
  type: TxnType;
  category_id: string | null;
  bucket_id: string;
  event_id: string | null;
  note: string;
  include: boolean;
  duplicateOf: string | null;
  confidence: number;
}
