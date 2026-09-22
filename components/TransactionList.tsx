"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkApply, deleteTransaction, patchTransaction, type BulkAction } from "@/lib/actions";
import { convertToTransfer, unlinkTransfer } from "@/lib/transfer-actions";
import { ConvertToTransfer } from "./ConvertToTransfer";
import { formatDayShort, formatINR } from "@/lib/format";
import type { RefData, TransactionRow, TxnType } from "@/lib/types";
import { ConfirmDialog, Sheet } from "./Sheet";
import { TransactionForm } from "./TransactionForm";
import { EmptyState } from "./Ui";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconSwap,
  IconTrash,
  IconX,
} from "./Icons";

interface Props {
  rows: TransactionRow[];
  refData: RefData;
  /** Dashboard preview: no checkboxes, no bulk bar. */
  compact?: boolean;
  emptyAction?: React.ReactNode;
}

export function TransactionList({ rows, refData, compact, emptyAction }: Props) {
  const router = useRouter();
  const [local, setLocal] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = useState<TransactionRow | null>(null);
  const [detail, setDetail] = useState<TransactionRow | null>(null);
  const [converting, setConverting] = useState<TransactionRow | null>(null);
  const [unlinking, setUnlinking] = useState<TransactionRow | null>(null);
  const [busy, startTransition] = useTransition();

  // Server is the source of truth; re-sync whenever it sends new rows.
  useEffect(() => {
    setLocal(rows);
    setSelected(new Set());
  }, [rows]);

  const patch = (id: string, changes: Partial<TransactionRow>) => {
    setLocal((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  };

  /** Optimistic: update the row immediately, roll back if the write fails. */
  const save = async (row: TransactionRow, changes: Partial<TransactionRow>, dbPatch: Record<string, unknown>) => {
    const before = { ...row };
    patch(row.id, changes);
    const res = await patchTransaction(row.id, dbPatch);
    if (!res.ok) {
      patch(row.id, before);
      alert(res.error);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = local.length > 0 && selected.size === local.length;

  if (local.length === 0) {
    return (
      <EmptyState
        title="No transactions yet"
        message="Add your first transaction or import a CSV to get started."
        action={emptyAction}
      />
    );
  }

  return (
    <>
      {/* ============================ desktop table ============================ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {!compact && (
                <th className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label="Select all transactions"
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(local.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
              )}
              <Th className="w-[78px]">Date</Th>
              <Th>Description</Th>
              <Th className="w-[130px]">Account</Th>
              <Th className="w-[150px]">Category</Th>
              <Th className="w-[120px]">Bucket</Th>
              <Th className="w-[110px]">Event</Th>
              <Th className="w-[110px] text-right">Amount</Th>
              <Th className="w-[170px]">Note</Th>
              <th className="w-[72px]" />
            </tr>
          </thead>
          <tbody>
            {local.map((r) => (
              <tr
                key={r.id}
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: selected.has(r.id) ? "var(--accent-soft)" : undefined,
                }}
                className="transition-colors"
              >
                {!compact && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.merchant ?? "transaction"}`}
                    />
                  </td>
                )}

                <td className="px-3 py-2 tnum whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {formatDayShort(r.txn_date)}
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TypeMark type={r.type} />
                    <span className="truncate font-medium">{r.merchant ?? "—"}</span>
                  </div>
                </td>

                <td className="px-3 py-2 truncate" style={{ color: "var(--text-muted)" }}>
                  {r.type === "transfer" && r.dest_name ? (
                    <span className="truncate">
                      {r.source_name} → {r.dest_name}
                    </span>
                  ) : (
                    r.source_name
                  )}
                </td>

                <td className="px-2 py-1.5">
                  <InlineSelect
                    value={r.category_id ?? ""}
                    placeholder="Uncategorized"
                    options={refData.categories
                      .filter(
                        (c) =>
                          // keep whatever is already set, even if its kind no
                          // longer matches — an imported card payment is an
                          // expense carrying a transfer category until converted
                          c.id === r.category_id ||
                          (r.type === "transfer" ? c.kind === "transfer" : c.kind === r.type)
                      )
                      .map((c) => ({ value: c.id, label: c.name }))}
                    onChange={(v) =>
                      save(
                        r,
                        {
                          category_id: v || null,
                          category_name:
                            refData.categories.find((c) => c.id === v)?.name ?? null,
                        },
                        { category_id: v || null }
                      )
                    }
                  />
                </td>

                <td className="px-2 py-1.5">
                  <InlineSelect
                    value={r.bucket_id}
                    options={refData.buckets.map((b) => ({ value: b.id, label: b.name }))}
                    onChange={(v) =>
                      save(
                        r,
                        { bucket_id: v, bucket_name: refData.buckets.find((b) => b.id === v)?.name ?? "" },
                        { bucket_id: v }
                      )
                    }
                  />
                </td>

                <td className="px-2 py-1.5">
                  <InlineSelect
                    value={r.event_id ?? ""}
                    placeholder="—"
                    options={refData.events.map((e) => ({ value: e.id, label: e.name }))}
                    onChange={(v) =>
                      save(
                        r,
                        { event_id: v || null, event_name: refData.events.find((e) => e.id === v)?.name ?? null },
                        { event_id: v || null }
                      )
                    }
                  />
                </td>

                <td className="px-3 py-2 text-right tnum font-semibold whitespace-nowrap">
                  <Amount row={r} />
                </td>

                {/* The note is the field that changes most, so it edits in place. */}
                <td className="px-2 py-1.5">
                  <InlineText
                    value={r.note ?? ""}
                    placeholder="Add note…"
                    onSave={(v) => save(r, { note: v || null }, { note: v || null })}
                  />
                </td>

                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {r.type === "transfer" ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setUnlinking(r)}
                        aria-label="Turn this transfer back into a normal transaction"
                        title="Not a transfer"
                      >
                        <IconSwap size={14} />
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConverting(r)}
                        aria-label="Convert to transfer"
                        title="Convert to transfer"
                      >
                        <IconSwap size={14} />
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditing(r)}
                      aria-label="Edit transaction"
                      title="Edit"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDeleting(r)}
                      aria-label="Delete transaction"
                      title="Delete"
                      style={{ color: "var(--expense)" }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============================= mobile cards ============================ */}
      <ul className="md:hidden list-none p-0 m-0">
        {local.map((r) => (
          <li
            key={r.id}
            style={{
              borderBottom: "1px solid var(--border)",
              background: selected.has(r.id) ? "var(--accent-soft)" : undefined,
            }}
          >
            <div className="flex items-start gap-2.5 px-4 py-3">
              {!compact && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Select ${r.merchant ?? "transaction"}`}
                />
              )}

              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => setDetail(r)}
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <TypeMark type={r.type} />
                    <span className="text-[14px] font-medium truncate" style={{ color: "var(--text)" }}>
                      {r.merchant ?? "—"}
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold tnum whitespace-nowrap">
                    <Amount row={r} />
                  </span>
                </div>

                <p className="text-[12px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {r.source_name}
                  {r.type === "transfer" && r.dest_name ? ` → ${r.dest_name}` : ""}
                </p>

                <p className="text-[12px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-muted)" }}>
                  <span>{r.bucket_name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{r.category_name ?? "Uncategorized"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDayShort(r.txn_date)}</span>
                  {r.event_name && <span className="chip">{r.event_name}</span>}
                </p>
              </button>
            </div>

            {/* Note stays editable without opening the detail sheet. */}
            <div className="px-4 pb-3" style={{ marginLeft: compact ? 0 : 26 }}>
              <InlineText
                value={r.note ?? ""}
                placeholder="Add note…"
                onSave={(v) => save(r, { note: v || null }, { note: v || null })}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* ================================ bulk bar ============================= */}
      {!compact && selected.size > 0 && (
        <BulkBar
          count={selected.size}
          refData={refData}
          busy={busy}
          onClear={() => setSelected(new Set())}
          /* Linking needs exactly two rows: one leg out, one leg in. */
          onLinkPair={
            selected.size === 2
              ? () => {
                  const [a, b] = [...selected];
                  startTransition(async () => {
                    const res = await convertToTransfer(a, { mergeWithId: b });
                    if (!res.ok) alert(res.error);
                    else {
                      setSelected(new Set());
                      router.refresh();
                    }
                  });
                }
              : undefined
          }
          onApply={(action) =>
            startTransition(async () => {
              const res = await bulkApply([...selected], action);
              if (!res.ok) alert(res.error);
              else {
                setSelected(new Set());
                router.refresh();
              }
            })
          }
        />
      )}

      <TransactionForm
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        refData={refData}
        editing={editing}
      />

      <MobileDetail
        row={detail}
        onClose={() => setDetail(null)}
        onEdit={(r) => {
          setDetail(null);
          setEditing(r);
        }}
        onDelete={(r) => {
          setDetail(null);
          setDeleting(r);
        }}
        onConvert={(r) => {
          setDetail(null);
          if (r.type === "transfer") setUnlinking(r);
          else setConverting(r);
        }}
      />

      <ConvertToTransfer
        row={converting}
        refData={refData}
        onClose={() => setConverting(null)}
      />

      <ConfirmDialog
        open={Boolean(unlinking)}
        title="Not a transfer?"
        message={
          unlinking
            ? `This will turn it back into an expense on ${unlinking.source_name}. If it was merged with a row from another account, that row is already gone and will not come back.`
            : ""
        }
        confirmLabel="Make it an expense"
        busy={busy}
        onCancel={() => setUnlinking(null)}
        onConfirm={() =>
          startTransition(async () => {
            if (!unlinking) return;
            const res = await unlinkTransfer(unlinking.id, "expense");
            if (!res.ok) alert(res.error);
            setUnlinking(null);
            router.refresh();
          })
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this transaction?"
        message={
          deleting
            ? `${deleting.merchant ?? "This transaction"} — ${formatINR(deleting.amount)} on ${formatDayShort(deleting.txn_date)}. This cannot be undone.`
            : ""
        }
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const res = await deleteTransaction(deleting.id);
            if (!res.ok) alert(res.error);
            setDeleting(null);
            router.refresh();
          })
        }
      />
    </>
  );
}

// ------------------------------------------------------------------ parts

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`text-left font-semibold px-3 py-2.5 ${className}`}
      style={{ color: "var(--text-muted)", fontSize: 12 }}
    >
      {children}
    </th>
  );
}

/** Direction is an icon + colour, never colour alone. */
function TypeMark({ type }: { type: TxnType }) {
  const map = {
    expense: { Icon: IconArrowUp, color: "var(--expense)", label: "Expense" },
    income: { Icon: IconArrowDown, color: "var(--income)", label: "Income" },
    transfer: { Icon: IconSwap, color: "var(--text-subtle)", label: "Transfer" },
  } as const;
  const { Icon, color, label } = map[type];
  return (
    <span style={{ color, flexShrink: 0, lineHeight: 0 }} title={label}>
      <Icon size={13} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Amount({ row }: { row: TransactionRow }) {
  const color =
    row.type === "income"
      ? "var(--income)"
      : row.type === "transfer"
        ? "var(--text-muted)"
        : "var(--expense)";
  const sign = row.type === "income" ? "+" : row.type === "transfer" ? "" : "−";
  return (
    <span style={{ color }}>
      {sign}
      {formatINR(row.amount)}
    </span>
  );
}

/** A select that looks like text until you interact with it. */
function InlineSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-[13px] truncate"
      style={{
        height: 30,
        padding: "0 6px",
        border: "1px solid transparent",
        borderRadius: 6,
        background: "transparent",
        color: value ? "var(--text)" : "var(--text-subtle)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.background = "var(--surface)";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.background = "transparent";
      }}
      onMouseEnter={(e) => {
        if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = "transparent";
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Click-to-edit text. Enter or blur saves, Escape reverts. */
function InlineText({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    setDraft(value);
    dirty.current = false;
  }, [value]);

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        dirty.current = true;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          dirty.current = false;
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (dirty.current && draft !== value) {
          dirty.current = false;
          onSave(draft.trim());
        }
      }}
      className="w-full text-[13px]"
      aria-label="Note"
      style={{
        height: 30,
        padding: "0 7px",
        border: "1px solid transparent",
        borderRadius: 6,
        background: "transparent",
        color: "var(--text)",
        fontFamily: "inherit",
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.background = "var(--surface)";
      }}
      onMouseEnter={(e) => {
        if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        if (document.activeElement !== e.currentTarget) e.currentTarget.style.background = "transparent";
      }}
    />
  );
}

// --------------------------------------------------------------- bulk bar

function BulkBar({
  count,
  refData,
  onApply,
  onClear,
  onLinkPair,
  busy,
}: {
  count: number;
  refData: RefData;
  onApply: (a: BulkAction) => void;
  onClear: () => void;
  /** Only supplied when exactly two rows are selected. */
  onLinkPair?: () => void;
  busy: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  const sources = useMemo(
    () => [
      ...refData.accounts.map((a) => ({ value: `acc:${a.id}`, label: a.name })),
      ...refData.cards.map((c) => ({ value: `card:${c.id}`, label: c.name })),
    ],
    [refData]
  );

  return (
    <>
      <div
        className="fixed inset-x-0 z-40 px-3 animate-in"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
      >
        <div
          className="mx-auto flex flex-wrap items-center gap-2 px-3 py-2.5 md:max-w-4xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
          }}
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-[13px] font-semibold whitespace-nowrap px-1" aria-live="polite">
            {count} selected
          </span>

          <BulkSelect
            label="Category"
            options={refData.categories.map((c) => ({ value: c.id, label: c.name }))}
            onPick={(v) => onApply({ kind: "category", value: v || null })}
            allowClear="Uncategorized"
            disabled={busy}
          />
          <BulkSelect
            label="Bucket"
            options={refData.buckets.map((b) => ({ value: b.id, label: b.name }))}
            onPick={(v) => v && onApply({ kind: "bucket", value: v })}
            disabled={busy}
          />
          <BulkSelect
            label="Account"
            options={sources}
            onPick={(v) => v && onApply({ kind: "source", value: v })}
            disabled={busy}
          />
          <BulkSelect
            label="Event"
            options={refData.events.map((e) => ({ value: e.id, label: e.name }))}
            onPick={(v) => onApply({ kind: "event", value: v || null })}
            allowClear="Remove event"
            disabled={busy}
          />
          <BulkSelect
            label="Type"
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
            onPick={(v) => v && onApply({ kind: "type", value: v as TxnType })}
            disabled={busy}
          />

          {onLinkPair && (
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={onLinkPair}
              title="Merge these two rows into one transfer"
            >
              <IconSwap size={13} />
              Link as transfer
            </button>
          )}

          <button className="btn btn-sm" disabled={busy} onClick={() => setNoteOpen(true)}>
            Note
          </button>
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() => onApply({ kind: "reviewed", value: true })}
          >
            Mark reviewed
          </button>
          <button
            className="btn btn-sm btn-danger"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <IconTrash size={13} />
            Delete
          </button>

          <button
            className="btn btn-ghost btn-sm ml-auto"
            onClick={onClear}
            aria-label="Clear selection"
          >
            <IconX size={15} />
          </button>
        </div>
      </div>

      <Sheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={`Set note on ${count} transaction${count === 1 ? "" : "s"}`}
        size="sm"
        footer={
          <>
            <button className="btn" onClick={() => setNoteOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                onApply({ kind: "note", value: note });
                setNoteOpen(false);
                setNote("");
              }}
            >
              Apply
            </button>
          </>
        }
      >
        <label className="label" htmlFor="bulk-note">
          Note
        </label>
        <input
          id="bulk-note"
          className="input"
          data-autofocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Replaces the existing note on every selected row"
        />
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${count} transaction${count === 1 ? "" : "s"}?`}
        message="This permanently removes the selected transactions. This cannot be undone."
        confirmLabel={`Delete ${count}`}
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          onApply({ kind: "delete" });
          setConfirmDelete(false);
        }}
      />
    </>
  );
}

function BulkSelect({
  label,
  options,
  onPick,
  allowClear,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
  allowClear?: string;
  disabled?: boolean;
}) {
  return (
    <select
      className="select btn-sm"
      disabled={disabled}
      value=""
      onChange={(e) => {
        onPick(e.target.value);
        e.target.value = "";
      }}
      aria-label={`Set ${label.toLowerCase()} for selected transactions`}
      style={{ width: "auto", minWidth: 96, height: 30, fontSize: 12 }}
    >
      <option value="" disabled>
        {label}…
      </option>
      {allowClear && <option value="">{allowClear}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ----------------------------------------------------------- mobile sheet

function MobileDetail({
  row,
  onClose,
  onEdit,
  onDelete,
  onConvert,
}: {
  row: TransactionRow | null;
  onClose: () => void;
  onEdit: (r: TransactionRow) => void;
  onDelete: (r: TransactionRow) => void;
  onConvert: (r: TransactionRow) => void;
}) {
  if (!row) return null;

  const fields: [string, string][] = [
    ["Date", formatDayShort(row.txn_date)],
    ["Type", row.type[0].toUpperCase() + row.type.slice(1)],
    ["Account", row.type === "transfer" && row.dest_name ? `${row.source_name} → ${row.dest_name}` : row.source_name],
    ["Category", row.category_name ?? "Uncategorized"],
    ["Bucket", row.bucket_name],
    ["Event", row.event_name ?? "None"],
    ["Note", row.note ?? "—"],
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title={row.merchant ?? "Transaction"}
      size="sm"
      footer={
        <>
          <button className="btn btn-danger" onClick={() => onDelete(row)}>
            <IconTrash size={14} />
            Delete
          </button>
          <button className="btn" onClick={() => onConvert(row)}>
            <IconSwap size={14} />
            {row.type === "transfer" ? "Not a transfer" : "To transfer"}
          </button>
          <button className="btn btn-primary" onClick={() => onEdit(row)}>
            <IconEdit size={14} />
            Edit
          </button>
        </>
      }
    >
      <p className="text-2xl font-semibold tnum mb-4">
        <Amount row={row} />
      </p>
      <dl className="space-y-2.5 m-0">
        {fields.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-4">
            <dt className="text-xs" style={{ color: "var(--text-muted)" }}>
              {k}
            </dt>
            <dd className="text-[13px] m-0 text-right" style={{ color: "var(--text)" }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
