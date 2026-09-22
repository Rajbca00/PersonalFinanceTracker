import Link from "next/link";
import { AddButton } from "@/components/AddButton";
import { BucketTabs, MonthSelector } from "@/components/DashboardControls";
import { DailyBars, DonutChart, BarList } from "@/components/Charts";
import { TransactionList } from "@/components/TransactionList";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/Ui";
import { IconTrip } from "@/components/Icons";
import { addMonths, formatINR, formatMonthLabel, monthRange } from "@/lib/format";
import { eventsInRange, getDashboard, getRefData, getTransactions } from "@/lib/queries";

export const dynamic = "force-dynamic";

function parseMonth(m?: string): { year: number; month: number } {
  const now = new Date();
  if (m) {
    const match = m.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      if (month >= 0 && month <= 11) return { year, month };
    }
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; bucket?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.m);
  const { from, to } = monthRange(year, month);

  const ref = await getRefData();
  const bucketId = sp.bucket && ref.buckets.some((b) => b.id === sp.bucket) ? sp.bucket : null;

  const prevMonth = addMonths(year, month, -1);
  const prevRange = monthRange(prevMonth.year, prevMonth.month);

  const [data, recent] = await Promise.all([
    getDashboard(from, to, bucketId, ref, prevRange),
    getTransactions({ from, to, bucketId: bucketId ?? undefined, pageSize: 8 }, ref),
  ]);

  const activeBucket = ref.buckets.find((b) => b.id === bucketId) ?? null;
  const monthEvents = eventsInRange(ref.events, from, to);
  const eventSpend = monthEvents
    .map((e) => {
      const hit = data.events.find((x) => x.id === e.id);
      return { ...e, total: hit?.total ?? 0, count: hit?.count ?? 0 };
    })
    .filter((e) => e.count > 0)
    .sort((a, b) => b.total - a.total);

  const pct = (cur: number, prev: number) =>
    prev === 0 ? null : { pct: ((cur - prev) / prev) * 100, label: "vs last month" };

  const hasAnything = data.txnCount > 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          activeBucket
            ? `${activeBucket.name} · ${formatMonthLabel(year, month)}`
            : formatMonthLabel(year, month)
        }
        actions={
          <>
            <MonthSelector year={year} month={month} />
            <span className="hidden sm:block">
              <AddButton />
            </span>
          </>
        }
      />

      <div className="mb-4">
        <BucketTabs buckets={ref.buckets} active={bucketId} />
      </div>

      {/* ------------------------------------------------ summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard
          label="Income"
          value={data.income}
          tone="income"
          delta={pct(data.income, data.prevIncome)}
          hint="This month"
        />
        <StatCard
          label="Expenses"
          value={data.expense}
          tone="expense"
          delta={pct(data.expense, data.prevExpense)}
          hint="This month"
        />
        <StatCard
          label="Net cash flow"
          value={data.net}
          tone={data.net >= 0 ? "income" : "expense"}
          hint={data.net >= 0 ? "Saved this month" : "Overspent this month"}
        />
        <StatCard
          label="Account balance"
          value={data.totalBalance}
          hint={`${ref.accounts.filter((a) => a.is_active).length} active accounts`}
        />
        <StatCard
          label="Card outstanding"
          value={data.totalOutstanding}
          tone={data.totalOutstanding > 0 ? "expense" : "neutral"}
          hint={`${ref.cards.filter((c) => c.is_active).length} cards`}
        />
      </div>

      {!hasAnything ? (
        <Panel>
          <EmptyState
            title="Nothing recorded for this month"
            message="Add your first transaction or import a CSV from your bank to see the breakdown here."
            action={
              <div className="flex gap-2">
                <AddButton label="Add transaction" />
                <Link href="/import" className="btn no-underline">
                  Import CSV
                </Link>
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          {/* -------------------------------------------- trips & events */}
          {eventSpend.length > 0 && (
            <Panel
              title="Trips & events this month"
              action={
                <Link
                  href="/events"
                  className="text-xs font-semibold no-underline"
                  style={{ color: "var(--accent)" }}
                >
                  View all
                </Link>
              }
              className="mb-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {eventSpend.map((e) => (
                  <Link
                    key={e.id}
                    href={`/transactions?event=${e.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg no-underline transition-colors"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <span
                      className="flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{ width: 34, height: 34, background: "var(--accent-soft)", color: "var(--accent)" }}
                    >
                      <IconTrip size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[13px] font-semibold truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {e.name}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {e.count} transaction{e.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span
                      className="text-[13px] font-semibold tnum flex-shrink-0"
                      style={{ color: "var(--text)" }}
                    >
                      {formatINR(e.total)}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}

          {/* ----------------------------------------------------- charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Panel title="Where the money went" className="lg:col-span-2">
              <DonutChart
                data={data.byCategory}
                total={data.expense}
                centerLabel="Total spent"
              />
            </Panel>

            <div className="space-y-4">
              <Panel title={bucketId ? "Spending by account" : "Spending by bucket"}>
                <BarList
                  data={
                    bucketId
                      ? data.bySource
                      : data.byBucket.map((b) => ({ id: b.id, label: b.name, value: b.expense }))
                  }
                  emptyMessage="No expenses in this period."
                />
              </Panel>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Panel title="Daily spending" className="lg:col-span-2">
              <DailyBars data={data.daily} />
            </Panel>

            <Panel title="Top merchants">
              <BarList data={data.topMerchants} colored={false} emptyMessage="No merchants yet." />
            </Panel>
          </div>

          {/* --------------------------------------- bucket comparison */}
          {!bucketId && data.byBucket.length > 0 && (
            <Panel title="Bucket comparison" className="mb-4" padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left font-semibold px-4 sm:px-5 py-2.5" style={{ color: "var(--text-muted)" }}>
                        Bucket
                      </th>
                      <th className="text-right font-semibold px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                        Income
                      </th>
                      <th className="text-right font-semibold px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                        Expense
                      </th>
                      <th className="text-right font-semibold px-4 sm:px-5 py-2.5" style={{ color: "var(--text-muted)" }}>
                        Net
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byBucket.map((b) => (
                      <tr key={b.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td className="px-4 sm:px-5 py-2.5 font-medium">
                          <Link
                            href={`/?m=${year}-${String(month + 1).padStart(2, "0")}&bucket=${b.id}`}
                            className="no-underline"
                            style={{ color: "var(--text)" }}
                          >
                            {b.name}
                          </Link>
                        </td>
                        <td className="text-right px-3 py-2.5 tnum" style={{ color: "var(--income)" }}>
                          {formatINR(b.income)}
                        </td>
                        <td className="text-right px-3 py-2.5 tnum" style={{ color: "var(--expense)" }}>
                          {formatINR(b.expense)}
                        </td>
                        <td
                          className="text-right px-4 sm:px-5 py-2.5 tnum font-semibold"
                          style={{ color: b.net >= 0 ? "var(--income)" : "var(--expense)" }}
                        >
                          {formatINR(b.net)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: "var(--surface-2)" }}>
                      <td className="px-4 sm:px-5 py-2.5 font-semibold">Combined</td>
                      <td className="text-right px-3 py-2.5 tnum font-semibold" style={{ color: "var(--income)" }}>
                        {formatINR(data.income)}
                      </td>
                      <td className="text-right px-3 py-2.5 tnum font-semibold" style={{ color: "var(--expense)" }}>
                        {formatINR(data.expense)}
                      </td>
                      <td
                        className="text-right px-4 sm:px-5 py-2.5 tnum font-semibold"
                        style={{ color: data.net >= 0 ? "var(--income)" : "var(--expense)" }}
                      >
                        {formatINR(data.net)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {/* -------------------------------------- recent transactions */}
          <Panel
            title="Recent transactions"
            action={
              <Link
                href="/transactions"
                className="text-xs font-semibold no-underline"
                style={{ color: "var(--accent)" }}
              >
                View all
              </Link>
            }
            padded={false}
          >
            <TransactionList rows={recent.rows} refData={ref} compact />
          </Panel>
        </>
      )}
    </>
  );
}
