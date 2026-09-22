"use client";

import { useMemo, useState } from "react";
import { formatINR, formatINRCompact, formatDayShort } from "@/lib/format";

/**
 * Hand-rolled charts.
 *
 * Three forms only, matching the three questions the dashboard answers:
 * where the money went (donut), which bucket spent it (bar list), and when it
 * went (daily bars). Colours come from the validated --c1..--c8 series tokens,
 * assigned in fixed order so an entity keeps its colour when a filter removes
 * another series. The 9th and beyond fold into a reserved neutral "Other"
 * rather than inventing new hues.
 */

export const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c7)", "var(--c8)"];
export const OTHER = "var(--c-other)";

export interface Datum {
  id: string;
  label: string;
  value: number;
}

/** Keeps the top 8 by value and rolls the tail into one neutral slice. */
export function rollup(data: Datum[], max = 8): (Datum & { color: string })[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= max) {
    return sorted.map((d, i) => ({ ...d, color: SERIES[i] }));
  }
  const head = sorted.slice(0, max - 1).map((d, i) => ({ ...d, color: SERIES[i] }));
  const tail = sorted.slice(max - 1);
  return [
    ...head,
    {
      id: "__other",
      label: `Other (${tail.length})`,
      value: tail.reduce((s, d) => s + d.value, 0),
      color: OTHER,
    },
  ];
}

// ------------------------------------------------------------------ donut

export function DonutChart({
  data,
  total,
  centerLabel = "Total spent",
}: {
  data: Datum[];
  total: number;
  centerLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const slices = useMemo(() => rollup(data), [data]);
  const sum = slices.reduce((s, d) => s + d.value, 0);

  if (sum <= 0) {
    return <ChartEmpty message="No spending in this period." />;
  }

  const R = 78;
  const STROKE = 26;
  const C = 2 * Math.PI * R;
  // A 2px surface gap between neighbouring arcs, expressed in stroke units.
  const GAP = slices.length > 1 ? 2.5 : 0;

  let offset = 0;
  const arcs = slices.map((d) => {
    const frac = d.value / sum;
    const len = Math.max(frac * C - GAP, 0.5);
    const arc = { ...d, len, offset, frac };
    offset += frac * C;
    return arc;
  });

  const active = hover ? slices.find((s) => s.id === hover) : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <div className="relative" style={{ width: 188, height: 188, flexShrink: 0 }}>
        <svg viewBox="0 0 200 200" width="188" height="188" role="img" aria-label={`${centerLabel}: ${formatINR(sum)}`}>
          <g transform="translate(100,100) rotate(-90)">
            {arcs.map((a) => (
              <circle
                key={a.id}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === a.id ? STROKE + 5 : STROKE}
                strokeDasharray={`${a.len} ${C - a.len}`}
                strokeDashoffset={-a.offset}
                strokeLinecap="butt"
                style={{
                  transition: "stroke-width .15s ease, opacity .15s ease",
                  opacity: hover && hover !== a.id ? 0.35 : 1,
                  cursor: "pointer",
                }}
                onMouseEnter={() => setHover(a.id)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
            {active ? active.label : centerLabel}
          </span>
          <span className="text-lg font-semibold tnum mt-0.5" style={{ color: "var(--text)" }}>
            {formatINR(active ? active.value : total || sum)}
          </span>
          {active && (
            <span className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
              {((active.value / sum) * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* The legend carries the values, so identity is never colour alone. */}
      <ul className="flex-1 w-full space-y-1 list-none p-0 m-0 min-w-0">
        {slices.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-2 px-2 py-1 rounded-md cursor-default transition-colors"
            style={{ background: hover === d.id ? "var(--surface-hover)" : "transparent" }}
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              aria-hidden="true"
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: d.color,
                flexShrink: 0,
              }}
            />
            <span className="text-xs truncate flex-1" style={{ color: "var(--text-muted)" }}>
              {d.label}
            </span>
            <span className="text-xs tnum font-medium" style={{ color: "var(--text)" }}>
              {formatINR(d.value)}
            </span>
            <span
              className="text-[10px] tnum w-9 text-right"
              style={{ color: "var(--text-subtle)" }}
            >
              {((d.value / sum) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------- bar list

export function BarList({
  data,
  colored = true,
  emptyMessage = "Nothing to show yet.",
}: {
  data: Datum[];
  colored?: boolean;
  emptyMessage?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <ChartEmpty message={emptyMessage} />;
  }

  return (
    <ul className="space-y-2.5 list-none p-0 m-0">
      {data.map((d, i) => (
        <li key={d.id}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {d.label}
            </span>
            <span className="text-xs tnum font-medium" style={{ color: "var(--text)" }}>
              {formatINR(d.value)}
            </span>
          </div>
          <div
            style={{
              height: 7,
              borderRadius: 4,
              background: "var(--surface-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.max((d.value / max) * 100, 1.5)}%`,
                height: "100%",
                borderRadius: 4,
                background: colored ? SERIES[i % SERIES.length] : "var(--accent)",
                transition: "width .35s cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------ daily bars

export function DailyBars({
  data,
}: {
  data: { date: string; expense: number; income: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0 || data.every((d) => d.expense === 0)) {
    return <ChartEmpty message="No spending recorded in this period." />;
  }

  const max = Math.max(...data.map((d) => d.expense), 1);
  const active = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="flex items-end justify-between mb-2" style={{ minHeight: 18 }}>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {active ? formatDayShort(active.date) : "Peak"}
        </span>
        <span className="text-xs tnum font-medium" style={{ color: "var(--text)" }}>
          {formatINR(active ? active.expense : max)}
        </span>
      </div>

      <div
        className="flex items-end gap-[2px]"
        style={{ height: 112, borderBottom: "1px solid var(--axis)" }}
        onMouseLeave={() => setHover(null)}
      >
        {data.map((d, i) => (
          <div
            key={d.date}
            className="flex-1 flex items-end"
            style={{ height: "100%", cursor: "default" }}
            onMouseEnter={() => setHover(i)}
            title={`${formatDayShort(d.date)} — ${formatINR(d.expense)}`}
          >
            <div
              style={{
                width: "100%",
                height: `${Math.max((d.expense / max) * 100, d.expense > 0 ? 3 : 0)}%`,
                minHeight: d.expense > 0 ? 3 : 0,
                borderRadius: "3px 3px 0 0",
                background: hover === i ? "var(--accent-hover)" : "var(--accent)",
                opacity: hover === null || hover === i ? 1 : 0.4,
                transition: "opacity .12s ease, background .12s ease",
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] tnum" style={{ color: "var(--text-subtle)" }}>
          {formatDayShort(data[0].date)}
        </span>
        <span className="text-[10px] tnum" style={{ color: "var(--text-subtle)" }}>
          {formatDayShort(data[data.length - 1].date)}
        </span>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- utilities

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex items-center justify-center text-center px-4"
      style={{ minHeight: 140, color: "var(--text-subtle)" }}
    >
      <p className="text-xs">{message}</p>
    </div>
  );
}

/** Small inline bar used in tables and list rows. */
export function MiniBar({ value, max, tone }: { value: number; max: number; tone?: string }) {
  return (
    <div style={{ height: 5, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(100, Math.max((value / Math.max(max, 1)) * 100, 1))}%`,
          height: "100%",
          borderRadius: 3,
          background: tone ?? "var(--accent)",
        }}
      />
    </div>
  );
}

export { formatINRCompact };
