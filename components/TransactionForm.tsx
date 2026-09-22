"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, updateTransaction } from "@/lib/actions";
import { toISODate } from "@/lib/format";
import type { RefData, TransactionRow, TxnType } from "@/lib/types";
import { Sheet } from "./Sheet";

const RECENT_KEY = "pft-recent-entry";

interface Recent {
  source?: string;
  bucket_id?: string;
  category_id?: string;
}

function readRecent(): Recent {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "{}");
  } catch {
    return {};
  }
}

const TYPES: { value: TxnType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

export function TransactionForm({
  open,
  onClose,
  refData,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  refData: RefData;
  editing?: TransactionRow | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [type, setType] = useState<TxnType>("expense");
  const [source, setSource] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sourceOptions = useMemo(
    () => [
      ...refData.accounts.filter((a) => a.is_active).map((a) => ({ value: `acc:${a.id}`, label: a.name, group: "Accounts" })),
      ...refData.cards.filter((c) => c.is_active).map((c) => ({ value: `card:${c.id}`, label: c.name, group: "Cards" })),
    ],
    [refData]
  );

  // Categories are filtered by what the transaction actually is, so an
  // expense can't be filed under "Salary / Income".
  const categoryOptions = useMemo(
    () =>
      refData.categories.filter(
        (c) => !c.is_archived && (type === "transfer" ? c.kind === "transfer" : c.kind === type)
      ),
    [refData.categories, type]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);

    if (editing) {
      setType(editing.type);
      setSource(editing.account_id ? `acc:${editing.account_id}` : `card:${editing.credit_card_id}`);
      setBucketId(editing.bucket_id);
      setCategoryId(editing.category_id ?? "");
    } else {
      const r = readRecent();
      setType("expense");
      setSource(r.source ?? sourceOptions[0]?.value ?? "");
      setBucketId(r.bucket_id ?? refData.buckets[0]?.id ?? "");
      setCategoryId(r.category_id ?? "");
    }
  }, [open, editing, refData.buckets, sourceOptions]);

  // Clear a category that doesn't belong to the newly chosen type.
  useEffect(() => {
    if (categoryId && !categoryOptions.some((c) => c.id === categoryId)) {
      setCategoryId("");
    }
  }, [categoryOptions, categoryId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res = editing ? await updateTransaction(editing.id, fd) : await createTransaction(fd);

    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    if (!editing) {
      try {
        localStorage.setItem(
          RECENT_KEY,
          JSON.stringify({ source, bucket_id: bucketId, category_id: categoryId })
        );
      } catch {}
    }

    router.refresh();
    onClose();
  }

  const destOptions = sourceOptions.filter((o) => o.value !== source);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "Add transaction"}
      size="md"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => formRef.current?.requestSubmit()}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Save transaction"}
          </button>
        </>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {/* Amount leads — it's the field you always fill. */}
        <div>
          <label className="label" htmlFor="tf-amount">
            Amount
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold"
              style={{ color: "var(--text-subtle)" }}
              aria-hidden="true"
            >
              ₹
            </span>
            <input
              id="tf-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              data-autofocus
              defaultValue={editing?.amount ?? ""}
              placeholder="0.00"
              className="input tnum"
              style={{ height: 56, fontSize: 26, fontWeight: 600, paddingLeft: 34 }}
            />
          </div>
        </div>

        {/* Type — segmented control, not a dropdown. */}
        <div>
          <span className="label">Type</span>
          <div
            role="radiogroup"
            aria-label="Transaction type"
            className="grid grid-cols-3 gap-1 p-1"
            style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
          >
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className="h-8 text-xs font-semibold rounded-md transition-colors"
                style={{
                  background: type === t.value ? "var(--accent)" : "transparent",
                  color: type === t.value ? "var(--accent-fg)" : "var(--text-muted)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="type" value={type} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tf-date">
              Date
            </label>
            <input
              id="tf-date"
              name="txn_date"
              type="date"
              required
              className="input"
              defaultValue={editing?.txn_date ?? toISODate(new Date())}
            />
          </div>

          <div>
            <label className="label" htmlFor="tf-source">
              {type === "transfer" ? "From" : "Account / Card"}
            </label>
            <select
              id="tf-source"
              name="source"
              className="select"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Select…</option>
              <optgroup label="Accounts">
                {sourceOptions.filter((o) => o.group === "Accounts").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Cards">
                {sourceOptions.filter((o) => o.group === "Cards").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {type === "transfer" && (
          <div className="animate-in">
            <label className="label" htmlFor="tf-dest">
              To
            </label>
            <select
              id="tf-dest"
              name="dest"
              className="select"
              required
              defaultValue={
                editing?.dest_account_id
                  ? `acc:${editing.dest_account_id}`
                  : editing?.dest_credit_card_id
                    ? `card:${editing.dest_credit_card_id}`
                    : ""
              }
            >
              <option value="">Select…</option>
              {destOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
              Transfers move money between your own accounts. They never count as
              income or expense.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tf-category">
              Category
            </label>
            <select
              id="tf-category"
              name="category_id"
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Uncategorized</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="tf-bucket">
              Bucket
            </label>
            <select
              id="tf-bucket"
              name="bucket_id"
              className="select"
              required
              value={bucketId}
              onChange={(e) => setBucketId(e.target.value)}
            >
              {refData.buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="tf-merchant">
              Merchant / Description
            </label>
            <input
              id="tf-merchant"
              name="merchant"
              className="input"
              placeholder="e.g. Swiggy"
              defaultValue={editing?.merchant ?? ""}
            />
          </div>

          <div>
            <label className="label" htmlFor="tf-event">
              Trip / Event
            </label>
            <select
              id="tf-event"
              name="event_id"
              className="select"
              defaultValue={editing?.event_id ?? ""}
            >
              <option value="">None</option>
              {refData.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="tf-note">
            Note
          </label>
          <input
            id="tf-note"
            name="note"
            className="input"
            placeholder="Optional"
            defaultValue={editing?.note ?? ""}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs px-3 py-2 rounded-md"
            style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
          >
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
