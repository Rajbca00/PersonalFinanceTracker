import Link from "next/link";
import { AddBucketButton, BucketActions } from "@/components/BucketManager";
import { BarList } from "@/components/Charts";
import { MonthSelector } from "@/components/DashboardControls";
import { IconBucket } from "@/components/Icons";
import { EmptyState, PageHeader, Panel } from "@/components/Ui";
import { formatINR, formatMonthLabel, monthRange } from "@/lib/format";
import { getDashboard, getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

function parseMonth(m?: string) {
  const now = new Date();
  const match = m?.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const month = Number(match[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(match[1]), month };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function BucketsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = parseMonth(sp.m);
  const { from, to } = monthRange(year, month);

  const ref = await getRefData();
  const data = await getDashboard(from, to, null, ref);

  return (
    <>
      <PageHeader
        title="Buckets"
        subtitle={`Comparing ${formatMonthLabel(year, month)}`}
        actions={
          <>
            <MonthSelector year={year} month={month} />
            <AddBucketButton />
          </>
        }
      />

      {ref.buckets.length === 0 ? (
        <Panel>
          <EmptyState
            title="No buckets yet"
            message="Buckets split your money by purpose — Personal, a side business, a temple fund. Every transaction belongs to exactly one."
            icon={<IconBucket size={22} />}
            action={<AddBucketButton />}
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Panel title="Spending share" className="lg:col-span-2">
              <BarList
                data={data.byBucket.map((b) => ({ id: b.id, label: b.name, value: b.expense }))}
                emptyMessage="No expenses this month."
              />
            </Panel>

            <Panel title="Combined">
              <dl className="space-y-3 m-0">
                <Row label="Income" value={data.income} tone="var(--income)" />
                <Row label="Expense" value={data.expense} tone="var(--expense)" />
                <Row
                  label="Net"
                  value={data.net}
                  tone={data.net >= 0 ? "var(--income)" : "var(--expense)"}
                  strong
                />
              </dl>
            </Panel>
          </div>

          <Panel title="All buckets" padded={false}>
            <ul className="list-none m-0 p-0">
              {ref.buckets.map((b) => {
                const stats = data.byBucket.find((x) => x.id === b.id);
                return (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 px-4 sm:px-5 py-3"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span
                      className="flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{ width: 34, height: 34, background: "var(--surface-2)", color: "var(--text-muted)" }}
                    >
                      <IconBucket size={17} />
                    </span>

                    <Link
                      href={`/?bucket=${b.id}&m=${year}-${String(month + 1).padStart(2, "0")}`}
                      className="min-w-0 flex-1 no-underline"
                      style={{ color: "var(--text)" }}
                    >
                      <span className="block text-[14px] font-medium truncate">{b.name}</span>
                      <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                        In {formatINR(stats?.income ?? 0)} · Out {formatINR(stats?.expense ?? 0)}
                      </span>
                    </Link>

                    <span
                      className="text-[14px] font-semibold tnum whitespace-nowrap"
                      style={{
                        color: (stats?.net ?? 0) >= 0 ? "var(--income)" : "var(--expense)",
                      }}
                    >
                      {formatINR(stats?.net ?? 0)}
                    </span>

                    <BucketActions bucket={b} />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: number;
  tone: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
        {label}
      </dt>
      <dd
        className="m-0 tnum"
        style={{ color: tone, fontWeight: strong ? 700 : 600, fontSize: strong ? 16 : 14 }}
      >
        {formatINR(value)}
      </dd>
    </div>
  );
}
