-- =============================================================
-- Personal Finance Tracker — schema
-- Run this in the Supabase SQL Editor.
-- Safe to re-run: it drops and recreates everything.
-- =============================================================

drop view  if exists card_balances      cascade;
drop view  if exists account_balances   cascade;
drop table if exists transactions       cascade;
drop table if exists import_batches     cascade;
drop table if exists events             cascade;
drop table if exists credit_cards       cascade;
drop table if exists accounts           cascade;
drop table if exists categories         cascade;
drop table if exists buckets            cascade;
drop table if exists users              cascade;

create extension if not exists pgcrypto;

-- Single-tenant today; the user_id column is here so that going
-- multi-user later is an RLS policy change, not a migration.
create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into users (id, email, name)
values ('00000000-0000-0000-0000-000000000001', null, 'Owner');

-- ------------------------------------------------------------------
-- Buckets
-- ------------------------------------------------------------------
create table buckets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  name        text not null,
  color       text not null default 'slate',
  sort_order  int  not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ------------------------------------------------------------------
-- Categories
-- ------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('expense','income','transfer')),
  icon        text not null default 'tag',
  is_system   boolean not null default false,
  is_archived boolean not null default false,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ------------------------------------------------------------------
-- Accounts (bank / savings / cash / wallet)
-- ------------------------------------------------------------------
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  name            text not null,
  type            text not null default 'bank' check (type in ('bank','savings','cash','wallet')),
  institution     text,
  opening_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, name)
);

-- ------------------------------------------------------------------
-- Credit cards
-- ------------------------------------------------------------------
create table credit_cards (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  name                text not null,
  provider            text,
  credit_limit        numeric(14,2),
  opening_outstanding numeric(14,2) not null default 0,
  statement_day       int check (statement_day between 1 and 31),
  due_day             int check (due_day between 1 and 31),
  is_active           boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, name)
);

-- ------------------------------------------------------------------
-- Trips & events
-- ------------------------------------------------------------------
create table events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  name        text not null,
  start_date  date,
  end_date    date,
  description text,
  bucket_id   uuid references buckets(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

-- ------------------------------------------------------------------
-- CSV import batches
-- ------------------------------------------------------------------
create table import_batches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  source_name     text,
  account_id      uuid references accounts(id) on delete set null,
  credit_card_id  uuid references credit_cards(id) on delete set null,
  row_count       int not null default 0,
  imported_count  int not null default 0,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- Transactions
--
-- A transfer is ONE row: the source is account_id / credit_card_id and the
-- destination is dest_account_id / dest_credit_card_id. Transfers are never
-- summed as income or expense anywhere, so they cannot be double counted.
-- ------------------------------------------------------------------
create table transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default '00000000-0000-0000-0000-000000000001' references users(id) on delete cascade,
  txn_date             date not null,
  type                 text not null check (type in ('expense','income','transfer')),
  amount               numeric(14,2) not null check (amount > 0),

  account_id           uuid references accounts(id)      on delete cascade,
  credit_card_id       uuid references credit_cards(id)  on delete cascade,
  dest_account_id      uuid references accounts(id)      on delete cascade,
  dest_credit_card_id  uuid references credit_cards(id)  on delete cascade,

  bucket_id            uuid not null references buckets(id) on delete restrict,
  category_id          uuid references categories(id)       on delete set null,
  event_id             uuid references events(id)           on delete set null,

  merchant             text,
  note                 text,
  reviewed             boolean not null default false,

  import_batch_id      uuid references import_batches(id) on delete set null,
  external_ref         text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- money leaves exactly one place
  constraint txn_one_source check (
    (account_id is not null)::int + (credit_card_id is not null)::int = 1
  ),
  -- a transfer lands in exactly one place; nothing else has a destination
  constraint txn_dest_rule check (
    (type = 'transfer'
       and (dest_account_id is not null)::int + (dest_credit_card_id is not null)::int = 1)
    or
    (type <> 'transfer'
       and dest_account_id is null and dest_credit_card_id is null)
  ),
  constraint txn_no_self_account check (
    dest_account_id is null or account_id is null or dest_account_id <> account_id
  ),
  constraint txn_no_self_card check (
    dest_credit_card_id is null or credit_card_id is null or dest_credit_card_id <> credit_card_id
  )
);

create index txn_date_idx     on transactions (txn_date desc, created_at desc);
create index txn_account_idx  on transactions (account_id);
create index txn_card_idx     on transactions (credit_card_id);
create index txn_bucket_idx   on transactions (bucket_id);
create index txn_category_idx on transactions (category_id);
create index txn_event_idx    on transactions (event_id);
create index txn_type_idx     on transactions (type);
-- speeds up the CSV duplicate check
create index txn_dedupe_idx   on transactions (txn_date, amount, account_id, credit_card_id);

-- ------------------------------------------------------------------
-- keep updated_at honest
-- ------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['buckets','categories','accounts','credit_cards','events','transactions','users']
  loop
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end;
$do$;

-- ------------------------------------------------------------------
-- Balances
--   account : opening + income - expense - transfers out + transfers in
--   card    : opening outstanding + purchases - payments in - refunds
-- ------------------------------------------------------------------
create view account_balances as
select
  a.id, a.user_id, a.name, a.type, a.institution, a.opening_balance,
  a.is_active, a.sort_order, a.created_at, a.updated_at,
  a.opening_balance
    + coalesce(sum(t.amount) filter (where t.type = 'income'   and t.account_id      = a.id), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'expense'  and t.account_id      = a.id), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'transfer' and t.account_id      = a.id), 0)
    + coalesce(sum(t.amount) filter (where t.type = 'transfer' and t.dest_account_id = a.id), 0)
  as current_balance
from accounts a
left join transactions t
  on t.account_id = a.id or t.dest_account_id = a.id
group by a.id;

create view card_balances as
select
  c.id, c.user_id, c.name, c.provider, c.credit_limit, c.opening_outstanding,
  c.statement_day, c.due_day, c.is_active, c.sort_order, c.created_at, c.updated_at,
  c.opening_outstanding
    + coalesce(sum(t.amount) filter (where t.type = 'expense'  and t.credit_card_id      = c.id), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'transfer' and t.dest_credit_card_id = c.id), 0)
    - coalesce(sum(t.amount) filter (where t.type = 'income'   and t.credit_card_id      = c.id), 0)
  as current_outstanding
from credit_cards c
left join transactions t
  on t.credit_card_id = c.id or t.dest_credit_card_id = c.id
group by c.id;

-- ------------------------------------------------------------------
-- RLS: enabled everywhere with no policies. The app connects with the
-- service role key from server code only, which bypasses RLS. The anon
-- key therefore reads nothing, even if the project URL is public.
-- ------------------------------------------------------------------
alter table users          enable row level security;
alter table buckets        enable row level security;
alter table categories     enable row level security;
alter table accounts       enable row level security;
alter table credit_cards   enable row level security;
alter table events         enable row level security;
alter table import_batches enable row level security;
alter table transactions   enable row level security;
