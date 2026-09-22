"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImport, previewCsv, type PreviewResult } from "@/lib/import-actions";
import { formatDayShort, formatINR } from "@/lib/format";
import type { RefData, StagedRow, TxnType } from "@/lib/types";
import { EmptyState, Panel } from "./Ui";
import { IconAlert, IconCheck, IconUpload, IconX } from "./Icons";

type Step = 1 | 2 | 3;

const STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Review & categorize" },
  { n: 3, label: "Done" },
] as const;

export function ImportWizard({ refData }: { refData: RefData }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [rows, setRows] = useState<StagedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(0);
  const [busy, start] = useTransition();

  const included = rows.filter((r) => r.include);
  const dupes = rows.filter((r) => r.duplicateOf).length;
  const transfers = rows.filter((r) => r.looksLikeTransfer).length;
  const credits = included.filter((r) => r.direction === "credit").length;
  const total = included.reduce((s, r) => s + r.amount, 0);

  function handleFile(file: File) {
    setError(null);
    if (!source) {
      setError("Choose the account or card this file came from first.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("That file is larger than 5 MB. Export a shorter date range.");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      start(async () => {
        const res = await previewCsv(text, source);
        if (!res.ok) {
          setError(res.error ?? "Could not read that file.");
          setPreview(res);
          return;
        }
        setPreview(res);
        setRows(res.rows);
        setStep(2);
      });
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  const patch = (key: string, changes: Partial<StagedRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  function doImport() {
    start(async () => {
      const res = await commitImport(rows, source, fileName);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setImported(res.imported);
      setStep(3);
      router.refresh();
    });
  }

  function reset() {
    setStep(1);
    setPreview(null);
    setRows([]);
    setFileName("");
    setError(null);
    setImported(0);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      {/* ------------------------------------------------------- stepper */}
      <ol className="flex items-center gap-2 mb-5 list-none p-0 m-0 overflow-x-auto">
        {STEPS.map((s, i) => {
          const state = step === s.n ? "current" : step > s.n ? "done" : "todo";
          return (
            <li key={s.n} className="flex items-center gap-2 flex-shrink-0">
              <span
                className="flex items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  width: 22,
                  height: 22,
                  background:
                    state === "todo" ? "var(--surface-2)" : "var(--accent)",
                  color: state === "todo" ? "var(--text-subtle)" : "var(--accent-fg)",
                }}
              >
                {state === "done" ? <IconCheck size={13} /> : s.n}
              </span>
              <span
                className="text-xs font-semibold whitespace-nowrap"
                style={{ color: state === "todo" ? "var(--text-subtle)" : "var(--text)" }}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span style={{ width: 24, height: 1, background: "var(--border-strong)" }} />
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-4 text-xs"
          role="alert"
          style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
        >
          <IconAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* ======================================================== step 1 */}
      {step === 1 && (
        <Panel title="Upload a statement">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="imp-source">
                Which account or card is this from?
              </label>
              <select
                id="imp-source"
                className="select"
                style={{ maxWidth: 360 }}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">Select…</option>
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
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className="flex flex-col items-center justify-center text-center px-5 py-10 rounded-xl"
              style={{
                border: "1.5px dashed var(--border-strong)",
                background: "var(--surface-2)",
                opacity: source ? 1 : 0.55,
              }}
            >
              <span style={{ color: "var(--text-subtle)" }}>
                <IconUpload size={26} />
              </span>
              <p className="text-[13px] font-medium mt-2 mb-1">
                Drop a CSV here, or choose a file
              </p>
              <p className="text-[11px] mb-3 m-0" style={{ color: "var(--text-muted)" }}>
                Exports from HDFC, ICICI, SBI, Axis and most card statements are
                detected automatically.
              </p>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                id="imp-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <label htmlFor="imp-file" className="btn btn-primary" style={{ cursor: "pointer" }}>
                {busy ? "Reading…" : "Choose CSV file"}
              </label>
            </div>

            {preview && !preview.ok && preview.headers.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Columns found in that file
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.headers.map((h, i) => (
                    <span key={`${h}-${i}`} className="chip">
                      {h || "(blank)"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ======================================================== step 2 */}
      {step === 2 && preview && (
        <>
          <Panel className="mb-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Stat label="Rows found" value={String(rows.length)} />
              <Stat label="Selected" value={String(included.length)} />
              <Stat label="Total" value={formatINR(total)} />
              {preview.skipped > 0 && (
                <Stat label="Skipped" value={String(preview.skipped)} hint="no date or amount" />
              )}
              <Stat label="Money in / out" value={`${credits} / ${included.length - credits}`} />
              {transfers > 0 && (
              <p
                className="flex items-start gap-2 text-[12px] mt-3 px-3 py-2 rounded-md m-0"
                style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
              >
                <IconAlert size={14} />
                <span>
                  {transfers} row{transfers === 1 ? "" : "s"} look like money moving
                  between your own accounts (a card payment, ATM withdrawal or self
                  transfer). They are imported so your balance stays right, but they
                  will count as spending until you open each one and choose
                  &ldquo;Convert to transfer&rdquo;.
                </span>
              </p>
            )}

            {dupes > 0 && (
                <Stat label="Possible duplicates" value={String(dupes)} tone="var(--warning)" />
              )}
              {transfers > 0 && (
                <Stat label="Look like transfers" value={String(transfers)} tone="var(--warning)" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Detected columns:
              </span>
              {Object.entries(preview.mapping).map(([k, v]) => (
                <span key={k} className="chip">
                  {k} → {v}
                </span>
              ))}
            </div>

            {transfers > 0 && (
              <p
                className="flex items-start gap-2 text-[12px] mt-3 px-3 py-2 rounded-md m-0"
                style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
              >
                <IconAlert size={14} />
                <span>
                  {transfers} row{transfers === 1 ? "" : "s"} look like money moving
                  between your own accounts (a card payment, ATM withdrawal or self
                  transfer). They are imported so your balance stays right, but they
                  will count as spending until you open each one and choose
                  &ldquo;Convert to transfer&rdquo;.
                </span>
              </p>
            )}

            {dupes > 0 && (
              <p
                className="flex items-start gap-2 text-[12px] mt-3 px-3 py-2 rounded-md m-0"
                style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
              >
                <IconAlert size={14} />
                <span>
                  {dupes} row{dupes === 1 ? "" : "s"} match a transaction already recorded on
                  the same date for the same amount. They are left unticked — tick any
                  you do want to bring in anyway.
                </span>
              </p>
            )}
          </Panel>

          <Panel title="Review each row" padded={false} className="mb-4">
            <StagedTable
              rows={rows}
              refData={refData}
              onPatch={patch}
              onToggleAll={(on) => setRows((prev) => prev.map((r) => ({ ...r, include: on })))}
            />
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="btn" onClick={reset} disabled={busy}>
              <IconX size={15} />
              Start over
            </button>
            <button
              className="btn btn-primary"
              onClick={doImport}
              disabled={busy || included.length === 0}
            >
              {busy
                ? "Importing…"
                : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}

      {/* ======================================================== step 3 */}
      {step === 3 && (
        <Panel>
          <EmptyState
            title={`Imported ${imported} transaction${imported === 1 ? "" : "s"}`}
            message="They are marked unreviewed so you can find them quickly and check the categories."
            icon={<IconCheck size={22} />}
            action={
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={reset}>
                  Import another file
                </button>
                <a href="/transactions" className="btn no-underline">
                  View transactions
                </a>
              </div>
            }
          />
        </Panel>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide m-0" style={{ color: "var(--text-subtle)" }}>
        {label}
      </p>
      <p className="text-[15px] font-semibold tnum m-0" style={{ color: tone ?? "var(--text)" }}>
        {value}
        {hint && (
          <span className="text-[11px] font-normal ml-1" style={{ color: "var(--text-muted)" }}>
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}

function StagedTable({
  rows,
  refData,
  onPatch,
  onToggleAll,
}: {
  rows: StagedRow[];
  refData: RefData;
  onPatch: (key: string, changes: Partial<StagedRow>) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const allOn = rows.every((r) => r.include);

  const categoriesFor = (type: TxnType) =>
    refData.categories.filter((c) => (type === "transfer" ? c.kind === "transfer" : c.kind === type));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="w-9 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label="Select all rows"
              />
            </th>
            {["Date", "Merchant", "Amount", "Type", "Category", "Bucket", "Event"].map((h) => (
              <th
                key={h}
                className="text-left font-semibold px-3 py-2.5"
                style={{ color: "var(--text-muted)", fontSize: 12 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              style={{
                borderBottom: "1px solid var(--border)",
                opacity: r.include ? 1 : 0.45,
                background: r.duplicateOf && r.include ? "var(--warning-bg)" : undefined,
              }}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => onPatch(r.key, { include: e.target.checked })}
                  aria-label={`Include ${r.merchant}`}
                />
              </td>

              <td className="px-3 py-2 tnum whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                {formatDayShort(r.txn_date)}
              </td>

              <td className="px-2 py-1.5" style={{ minWidth: 210 }}>
                <input
                  className="input"
                  style={{ height: 30 }}
                  value={r.merchant}
                  onChange={(e) => onPatch(r.key, { merchant: e.target.value })}
                  aria-label="Merchant"
                />
                <p
                  className="text-[10px] mt-0.5 mb-0 truncate"
                  style={{ color: "var(--text-subtle)" }}
                  title={r.rawDescription}
                >
                  {r.rawDescription}
                </p>
                {r.duplicateOf && (
                  <span className="chip mt-1" style={{ color: "var(--warning)" }}>
                    Possible duplicate
                  </span>
                )}
                {r.looksLikeTransfer && (
                  <span className="chip mt-1" style={{ color: "var(--warning)" }}>
                    Looks like a transfer
                  </span>
                )}
              </td>

              <td className="px-3 py-2 tnum font-semibold whitespace-nowrap">
                <span
                  style={{
                    color: r.direction === "credit" ? "var(--income)" : "var(--expense)",
                  }}
                >
                  {r.direction === "credit" ? "+" : "−"}
                  {formatINR(r.amount)}
                </span>
                <span className="block text-[10px] font-normal" style={{ color: "var(--text-subtle)" }}>
                  {r.direction === "credit" ? "Credit" : "Debit"}
                </span>
              </td>

              <td className="px-2 py-1.5">
                <select
                  className="select"
                  style={{ height: 30, minWidth: 96 }}
                  value={r.type}
                  onChange={(e) => {
                    const type = e.target.value as TxnType;
                    const stillValid = categoriesFor(type).some((c) => c.id === r.category_id);
                    onPatch(r.key, { type, category_id: stillValid ? r.category_id : null });
                  }}
                  aria-label="Type"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </td>

              <td className="px-2 py-1.5">
                <select
                  className="select"
                  style={{ height: 30, minWidth: 150 }}
                  value={r.category_id ?? ""}
                  onChange={(e) => onPatch(r.key, { category_id: e.target.value || null })}
                  aria-label="Category"
                >
                  <option value="">Uncategorized</option>
                  {categoriesFor(r.type).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-2 py-1.5">
                <select
                  className="select"
                  style={{ height: 30, minWidth: 120 }}
                  value={r.bucket_id}
                  onChange={(e) => onPatch(r.key, { bucket_id: e.target.value })}
                  aria-label="Bucket"
                >
                  {refData.buckets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </td>

              <td className="px-2 py-1.5">
                <select
                  className="select"
                  style={{ height: 30, minWidth: 120 }}
                  value={r.event_id ?? ""}
                  onChange={(e) => onPatch(r.key, { event_id: e.target.value || null })}
                  aria-label="Event"
                >
                  <option value="">None</option>
                  {refData.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
