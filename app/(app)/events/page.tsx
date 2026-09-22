import Link from "next/link";
import { AddEventButton, EventActions } from "@/components/EventManager";
import { IconTrip } from "@/components/Icons";
import { EmptyState, PageHeader, Panel } from "@/components/Ui";
import { formatDateFull, formatINR, formatNumber } from "@/lib/format";
import { getEventsWithTotals, getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const ref = await getRefData();
  const events = await getEventsWithTotals(ref);

  const totalSpent = events.reduce((s, e) => s + e.total_spent, 0);
  const bucketName = (id: string | null) =>
    id ? ref.buckets.find((b) => b.id === id)?.name ?? null : null;

  const dateRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "No dates set";
    if (start && end && start !== end) return `${formatDateFull(start)} — ${formatDateFull(end)}`;
    return formatDateFull((start ?? end)!);
  };

  return (
    <>
      <PageHeader
        title="Trips & events"
        subtitle={
          events.length > 0
            ? `${events.length} tracked · ${formatINR(totalSpent)} in total`
            : undefined
        }
        actions={<AddEventButton buckets={ref.buckets} />}
      />

      {events.length === 0 ? (
        <Panel>
          <EmptyState
            title="No trips or events yet"
            message="Create one to track spending for a trip or special occasion. A transaction keeps its normal category and bucket — the event is an extra dimension."
            icon={<IconTrip size={22} />}
            action={<AddEventButton buckets={ref.buckets} />}
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((e) => (
            <div key={e.id} className="card p-4 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <span
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 34, height: 34, background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <IconTrip size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[14px] font-semibold truncate m-0">{e.name}</h2>
                  <p className="text-[11px] m-0 mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {dateRange(e.start_date, e.end_date)}
                  </p>
                </div>
                <EventActions event={e} buckets={ref.buckets} />
              </div>

              {e.description && (
                <p
                  className="text-[12px] mb-3 m-0"
                  style={{
                    color: "var(--text-muted)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {e.description}
                </p>
              )}

              <div className="flex items-baseline justify-between mt-auto pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div>
                  <p className="text-[18px] font-semibold tnum m-0">{formatINR(e.total_spent)}</p>
                  <p className="text-[11px] m-0" style={{ color: "var(--text-muted)" }}>
                    {formatNumber(e.txn_count)} transaction{e.txn_count === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {bucketName(e.bucket_id) && <span className="chip">{bucketName(e.bucket_id)}</span>}
                  <Link
                    href={`/transactions?event=${e.id}`}
                    className="text-[11px] font-semibold no-underline"
                    style={{ color: "var(--accent)" }}
                  >
                    View transactions →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
