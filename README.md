# Personal Finance Tracker

A personal finance tracker for accounts, credit cards, spending buckets and
trips — built for daily use rather than accounting. Next.js + Neon Postgres,
deployable to Vercel.

**Core workflow:** add or import a transaction → categorize it → assign a bucket
→ optionally tag a trip → watch it on the dashboard.

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | Server components + server actions; one deployable unit |
| Database | Neon (serverless Postgres) | HTTP driver, so no connection pool to exhaust on Vercel |
| Styling | Tailwind v4 + CSS variables | Theming (light/dark/system + 4 accents) without a runtime |
| Charts | Hand-rolled SVG/HTML | No chart dependency; colours follow the theme tokens |
| CSV | Custom quote-aware parser | Bank exports vary too much for a fixed schema |

No chart library, no CSV library, no UI kit — four runtime dependencies total
(`@neondatabase/serverless`, `next`, `react`, `react-dom`).

---

## Setup

### 1. Create the database

In a new [Neon](https://neon.tech) project, open the **SQL Editor** and run:

1. `db/schema.sql` — tables, indexes, balance views, triggers
2. `db/seed.sql` — *optional* sample data (Jul–Sep 2026) so the dashboard
   has something to show immediately

Or, once `.env.local` exists (step 2), run them from here:

```bash
npm run db:schema
npm run db:seed
```

Both are safe to re-run; they drop and recreate.

### 2. Configure the environment

Copy `.env.example` to `.env.local` and fill in:

```bash
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
APP_PASSWORD=<a strong password>
AUTH_SECRET=<random string, e.g. openssl rand -base64 32>
```

Use the **pooled** connection string from the Neon dashboard, and keep
`?sslmode=require`.

### 3. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. If the database isn't configured you'll get a setup
page instead of a stack trace.

---

## Deploying to Vercel

```bash
npx vercel
```

Then add the same three environment variables in **Project → Settings →
Environment Variables** and redeploy. Every page is `force-dynamic`, so no build
-time database access is needed and the build works before the schema exists.

---

## Security model

This app holds real financial data at a public URL, so two things are deliberate:

- **`DATABASE_URL` never reaches the browser.** It has no `NEXT_PUBLIC_` prefix,
  and every query runs inside a server component, a server action, or the proxy.
  There is no public API surface onto these tables, so the browser is never
  handed a database credential.
- **A password gate sits in front of the app.** `APP_PASSWORD` plus an
  HMAC-signed, HTTP-only cookie (30 days). This is a single shared password, not
  user accounts — if you ever need real multi-user access, add an auth provider
  and RLS policies keyed on `users.id`, connecting as a non-owner role. The
  schema already carries a `user_id` column on every table for exactly that.

If `APP_PASSWORD` is unset the gate is **off** — convenient locally, and the app
warns you in the sidebar and on Settings. Set it before deploying.

---

## Data model

```
users ─┬─ buckets ──────┬─ transactions ─┬─ categories
       ├─ categories    │                ├─ events
       ├─ accounts ─────┤                └─ import_batches
       ├─ credit_cards ─┘
       └─ events
```

Two deliberate departures from a textbook schema:

**Transfers are one row, not two.** A transfer carries `account_id`/`credit_card_id`
(source) and `dest_account_id`/`dest_credit_card_id` (destination) on a single
`transactions` row. Every aggregation skips `type = 'transfer'` outright, so a
transfer can never be counted as income or expense — the double-counting problem
is structurally impossible rather than handled by convention. It also keeps one
line per transfer in the list instead of two confusing halves. Database check
constraints enforce that money leaves exactly one place, a transfer lands in
exactly one place, and nothing transfers to itself.

**`event_id` lives on the transaction** rather than in a join table, because a
transaction belongs to at most one trip or event.

Balances are Postgres views, so they can never drift from the transactions:

```
account : opening_balance     + income − expense − transfers out + transfers in
card    : opening_outstanding + purchases − payments in − refunds
```

A credit-card purchase is an expense on the day it happens. Paying the bill is a
transfer from a bank account to the card — it reduces both the bank balance and
the card outstanding, and is never a second expense.

---

## CSV import

Four steps: **upload → preview → categorize → import**. Nothing is written until
you confirm.

The parser sniffs the header row rather than matching a per-bank template, so it
handles HDFC (`Narration` + `Withdrawal`/`Deposit`), ICICI (`Transaction Remarks`
+ `Debit`/`Credit`), card statements (one `Amount` column + a Dr/Cr marker), and
files with preamble rows above the real header. Ambiguous numeric dates are read
as `dd/mm/yyyy` — Indian bank convention.

Categorization is a **deterministic rule table** in `lib/categorize.ts`: ~40
merchant patterns mapping to categories, plus narration cleanup that strips
reference numbers, UPI handles and city names. `SWIGGY INSTAMART CHENNAI 4429911`
becomes `Swiggy Instamart`. Every suggestion is editable in the preview before
import. To improve it, add rows to the `RULES` array.

Rows matching an existing transaction on the same account, date and amount are
flagged as **possible duplicates** and highlighted, but left selected — you
decide, nothing is silently dropped.

`public/sample-statement.csv` is a realistic HDFC-format file for testing the
flow end to end.

---

## Notable implementation details

- **Dates parse as local, not UTC.** `new Date("2026-09-22")` is UTC midnight and
  lands on the 21st in western timezones, which would file transactions in the
  wrong month. `parseISODate` splits the string instead.
- **Chart colours are validated for colour blindness.** The 8-series palette
  clears deuteranopia, protanopia and tritanopia separation thresholds against
  both the light and dark surfaces, and the dark steps are chosen for the dark
  surface rather than flipped from light. A 9th category folds into a reserved
  neutral "Other" rather than inventing a hue.
- **Income/expense is never colour alone** — direction also carries an arrow icon
  and a screen-reader label.
- **Inline edits are optimistic** and roll back if the write fails.
- **The theme applies before first paint** via a small inline script, so there's
  no flash of the wrong theme.

---

## Project layout

```
app/
  (app)/              screens behind the password gate
    page.tsx            dashboard
    transactions/       list, filters, bulk edit
    accounts/           list + [id] detail
    cards/[id]/         card detail with credit usage
    buckets/            bucket comparison
    events/             trips & events
    import/             CSV wizard
    settings/           theme, data, categories
  login/              password gate
  setup/              shown when DATABASE_URL isn't set
lib/
  db.ts               Neon connection + safe SET-clause builder
  queries.ts          reads
  actions.ts          writes (server actions)
  import-actions.ts   CSV preview + commit
  csv.ts              parser + bank-format detection
  categorize.ts       merchant rules
  format.ts           Indian currency + date helpers
  auth.ts             HMAC session cookie
components/           UI, charts, managers
scripts/run-sql.mjs   applies a .sql file to DATABASE_URL
db/                   schema.sql, seed.sql
proxy.ts              setup redirect + auth gate
```

---

## Scripts

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run start      # serve the build
npm run typecheck  # tsc --noEmit
npm run db:schema  # apply db/schema.sql to DATABASE_URL
npm run db:seed    # load the sample data
```
