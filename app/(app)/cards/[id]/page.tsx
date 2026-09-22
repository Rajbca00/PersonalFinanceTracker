import { notFound } from "next/navigation";
import { AccountManagerButtons } from "@/components/AccountManager";
import { AddButton } from "@/components/AddButton";
import { Pagination } from "@/components/Pagination";
import { TransactionList } from "@/components/TransactionList";
import { PageHeader, Panel, StatCard } from "@/components/Ui";
import { formatINR } from "@/lib/format";
import { getRefData, getTransactions } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;

  const ref = await getRefData();
  const card = ref.cards.find((c) => c.id === id);
  if (!card) notFound();

  const { rows, total, page: current, pageSize } = await getTransactions(
    { cardId: id, page: Number(page) || 1, pageSize: 50 },
    ref
  );

  const purchases = rows
    .filter((r) => r.type === "expense" && r.credit_card_id === id)
    .reduce((s, r) => s + r.amount, 0);
  const payments = rows
    .filter((r) => r.type === "transfer" && r.dest_credit_card_id === id)
    .reduce((s, r) => s + r.amount, 0);

  const available = card.credit_limit === null ? null : card.credit_limit - card.current_outstanding;
  const usedPct =
    card.credit_limit && card.credit_limit > 0
      ? Math.min(100, (card.current_outstanding / card.credit_limit) * 100)
      : null;

  return (
    <>
      <PageHeader
        title={card.name}
        subtitle={card.provider ?? "Credit card"}
        actions={
          <>
            <AccountManagerButtons card={card} />
            <span className="hidden sm:block">
              <AddButton />
            </span>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Outstanding"
          value={card.current_outstanding}
          tone={card.current_outstanding > 0 ? "expense" : "neutral"}
          hint="Opening + purchases − payments"
        />
        <StatCard
          label="Available credit"
          value={available ?? 0}
          hint={card.credit_limit === null ? "No limit set" : `Of ${formatINR(card.credit_limit)}`}
        />
        <StatCard label="Purchases" value={purchases} tone="expense" hint="On this page" />
        <StatCard label="Payments" value={payments} tone="income" hint="On this page" />
      </div>

      {usedPct !== null && (
        <div className="card p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Credit used
            </span>
            <span className="text-xs tnum font-semibold">{usedPct.toFixed(0)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
            <div
              style={{
                width: `${usedPct}%`,
                height: "100%",
                borderRadius: 4,
                background: usedPct > 80 ? "var(--expense)" : "var(--accent)",
                transition: "width .35s ease",
              }}
            />
          </div>
          <p className="text-[11px] mt-2 m-0" style={{ color: "var(--text-muted)" }}>
            Purchases count as expenses on the day they happen. Paying the bill is a
            transfer from your bank account, so it never counts as a second expense.
          </p>
        </div>
      )}

      <Panel title={`Transactions (${total.toLocaleString("en-IN")})`} padded={false}>
        <TransactionList rows={rows} refData={ref} emptyAction={<AddButton label="Add transaction" />} />
      </Panel>

      <Pagination page={current} pageSize={pageSize} total={total} />
    </>
  );
}
