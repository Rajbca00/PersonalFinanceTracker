"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { addMonths, formatMonthLabel } from "@/lib/format";
import type { Bucket } from "@/lib/types";
import { IconChevronLeft, IconChevronRight } from "./Icons";

function useSetParams() {
  const router = useRouter();
  const params = useSearchParams();

  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.push(`?${next.toString()}`, { scroll: false });
    },
    [router, params]
  );
}

export function MonthSelector({ year, month }: { year: number; month: number }) {
  const setParams = useSetParams();
  const now = new Date();

  const go = (delta: number) => {
    const t = addMonths(year, month, delta);
    setParams({ m: `${t.year}-${String(t.month + 1).padStart(2, "0")}` });
  };

  const isCurrent = year === now.getFullYear() && month === now.getMonth();

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div
        className="flex items-center"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <button
          className="btn btn-ghost btn-sm"
          style={{ borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)" }}
          onClick={() => go(-1)}
          aria-label="Previous month"
        >
          <IconChevronLeft size={16} />
        </button>
        <span
          className="text-[13px] font-semibold px-1 text-center"
          style={{ minWidth: 118 }}
          aria-live="polite"
        >
          {formatMonthLabel(year, month)}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}
          onClick={() => go(1)}
          aria-label="Next month"
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      {!isCurrent && (
        <button
          className="btn btn-sm"
          onClick={() =>
            setParams({ m: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` })
          }
        >
          This month
        </button>
      )}
    </div>
  );
}

export function BucketTabs({
  buckets,
  active,
}: {
  buckets: Bucket[];
  active: string | null;
}) {
  const setParams = useSetParams();

  const tab = (id: string | null, label: string) => {
    const on = active === id;
    return (
      <button
        key={id ?? "all"}
        onClick={() => setParams({ bucket: id })}
        className="h-8 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
        style={{
          background: on ? "var(--accent)" : "transparent",
          color: on ? "var(--accent-fg)" : "var(--text-muted)",
        }}
        aria-pressed={on}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-1 p-1 overflow-x-auto"
      style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
      role="group"
      aria-label="Filter by bucket"
    >
      {tab(null, "All buckets")}
      {buckets.map((b) => tab(b.id, b.name))}
    </div>
  );
}
