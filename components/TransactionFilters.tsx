"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { RefData, TxnFilters } from "@/lib/types";
import { IconFilter, IconSearch, IconX } from "./Icons";

export function TransactionFilters({
  refData,
  current,
}: {
  refData: RefData;
  current: TxnFilters;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(current.search ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  };

  // Debounced search — typing shouldn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((current.search ?? "") !== search) set({ q: search || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeCount = [
    current.bucketId,
    current.categoryId,
    current.eventId,
    current.accountId,
    current.cardId,
    current.type,
    current.from,
    current.to,
    current.minAmount,
    current.maxAmount,
    current.needsTransferReview,
  ].filter(Boolean).length;

  const clearAll = () => {
    setSearch("");
    startTransition(() => router.push("?", { scroll: false }));
  };

  const sourceValue = current.accountId
    ? `acc:${current.accountId}`
    : current.cardId
      ? `card:${current.cardId}`
      : "";

  return (
    <div className="space-y-3 mb-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <span
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-subtle)" }}
          >
            <IconSearch size={15} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Search merchant or note…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search transactions"
          />
        </div>

        <button
          className="btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="txn-filters"
        >
          <IconFilter size={15} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span
              className="tnum"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                borderRadius: 999,
                fontSize: 10,
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              {activeCount}
            </span>
          )}
        </button>

        <select
          className="select"
          style={{ width: "auto", minWidth: 120 }}
          value={current.sort ?? "date_desc"}
          onChange={(e) => set({ sort: e.target.value })}
          aria-label="Sort transactions"
        >
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Largest first</option>
          <option value="amount_asc">Smallest first</option>
        </select>
      </div>

      {open && (
        <div
          id="txn-filters"
          className="card p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 animate-in"
        >
          <Field label="From">
            <input
              type="date"
              className="input"
              value={current.from ?? ""}
              onChange={(e) => set({ from: e.target.value || null })}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="input"
              value={current.to ?? ""}
              onChange={(e) => set({ to: e.target.value || null })}
            />
          </Field>

          <Field label="Account / Card">
            <select
              className="select"
              value={sourceValue}
              onChange={(e) => {
                const v = e.target.value;
                set({
                  account: v.startsWith("acc:") ? v.slice(4) : null,
                  card: v.startsWith("card:") ? v.slice(5) : null,
                });
              }}
            >
              <option value="">All</option>
              <optgroup label="Accounts">
                {refData.accounts.map((a) => (
                  <option key={a.id} value={`acc:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cards">
                {refData.cards.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>

          <Field label="Bucket">
            <select
              className="select"
              value={current.bucketId ?? ""}
              onChange={(e) => set({ bucket: e.target.value || null })}
            >
              <option value="">All</option>
              {refData.buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category">
            <select
              className="select"
              value={current.categoryId ?? ""}
              onChange={(e) => set({ category: e.target.value || null })}
            >
              <option value="">All</option>
              {refData.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Type">
            <select
              className="select"
              value={current.type ?? ""}
              onChange={(e) => set({ type: e.target.value || null })}
            >
              <option value="">All</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
          </Field>

          <Field label="Trip / Event">
            <select
              className="select"
              value={current.eventId ?? ""}
              onChange={(e) => set({ event: e.target.value || null })}
            >
              <option value="">All</option>
              {refData.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Amount range">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                className="input tnum"
                placeholder="Min"
                defaultValue={current.minAmount ?? ""}
                onBlur={(e) => set({ min: e.target.value || null })}
                aria-label="Minimum amount"
              />
              <input
                type="number"
                className="input tnum"
                placeholder="Max"
                defaultValue={current.maxAmount ?? ""}
                onBlur={(e) => set({ max: e.target.value || null })}
                aria-label="Maximum amount"
              />
            </div>
          </Field>

          <div className="col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={Boolean(current.needsTransferReview)}
                onChange={(e) => set({ needsTransfer: e.target.checked ? "1" : null })}
              />
              Needs transfer review
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                — imported rows that look like money moved between your own accounts
              </span>
            </label>
          </div>

          {activeCount > 0 && (
            <div className="col-span-2 lg:col-span-4 flex justify-end">
              <button className="btn btn-sm" onClick={clearAll}>
                <IconX size={13} />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
