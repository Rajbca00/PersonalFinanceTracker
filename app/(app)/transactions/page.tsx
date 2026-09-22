import Link from "next/link";
import { AddButton } from "@/components/AddButton";
import { Pagination } from "@/components/Pagination";
import { TransactionFilters } from "@/components/TransactionFilters";
import { TransactionList } from "@/components/TransactionList";
import { PageHeader, Panel } from "@/components/Ui";
import { formatINR } from "@/lib/format";
import { getRefData, getTransactions } from "@/lib/queries";
import type { TxnFilters, TxnType } from "@/lib/types";

export const dynamic = "force-dynamic";

const SORTS = new Set(["date_desc", "date_asc", "amount_desc", "amount_asc"]);
const TYPES = new Set(["expense", "income", "transfer"]);

type SP = Record<string, string | undefined>;

function toFilters(sp: SP): TxnFilters {
  const n = (v?: string) => {
    if (!v) return undefined;
    const x = Number(v);
    return Number.isFinite(x) ? x : undefined;
  };

  return {
    from: sp.from,
    to: sp.to,
    bucketId: sp.bucket,
    categoryId: sp.category,
    eventId: sp.event,
    accountId: sp.account,
    cardId: sp.card,
    type: sp.type && TYPES.has(sp.type) ? (sp.type as TxnType) : undefined,
    search: sp.q,
    minAmount: n(sp.min),
    maxAmount: n(sp.max),
    sort: sp.sort && SORTS.has(sp.sort) ? (sp.sort as TxnFilters["sort"]) : "date_desc",
    page: n(sp.page) ?? 1,
    pageSize: 50,
  };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const filters = toFilters(sp);

  const ref = await getRefData();
  const { rows, total, page, pageSize } = await getTransactions(filters, ref);

  // Totals for what is actually on screen, not the whole database.
  const pageIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0);
  const pageExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${total.toLocaleString("en-IN")} transaction${total === 1 ? "" : "s"}`}
        actions={
          <>
            <Link href="/import" className="btn no-underline">
              Import CSV
            </Link>
            <span className="hidden sm:block">
              <AddButton />
            </span>
          </>
        }
      />

      <TransactionFilters refData={ref} current={filters} />

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 px-1">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            On this page:
          </span>
          <span className="text-xs tnum" style={{ color: "var(--income)" }}>
            Income {formatINR(pageIncome)}
          </span>
          <span className="text-xs tnum" style={{ color: "var(--expense)" }}>
            Expense {formatINR(pageExpense)}
          </span>
          <span className="text-xs tnum" style={{ color: "var(--text-muted)" }}>
            Net {formatINR(pageIncome - pageExpense)}
          </span>
        </div>
      )}

      <Panel padded={false}>
        <TransactionList
          rows={rows}
          refData={ref}
          emptyAction={
            <div className="flex gap-2">
              <AddButton label="Add transaction" />
              <Link href="/import" className="btn no-underline">
                Import CSV
              </Link>
            </div>
          }
        />
      </Panel>

      <Pagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}
