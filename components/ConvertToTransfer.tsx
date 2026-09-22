"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  convertToTransfer,
  findTransferCandidates,
  type Candidate,
} from "@/lib/transfer-actions";
import { formatDateFull, formatINR } from "@/lib/format";
import type { RefData, TransactionRow } from "@/lib/types";
import { Sheet } from "./Sheet";
import { IconAlert, IconArrowRight, IconCard, IconSwap, IconWallet } from "./Icons";

/**
 * Matches a transaction to its other half in a different account.
 *
 * A transfer is one row carrying both ends, so picking a match MERGES the two
 * rows — the counterpart is removed. That is stated plainly in the UI, because
 * a row silently disappearing from a statement view would be alarming.
 */
export function ConvertToTransfer({
  row,
  refData,
  onClose,
}: {
  row: TransactionRow | null;
  refData: RefData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();

  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [widened, setWidened] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState<"match" | "pick">("match");
  const [error, setError] = useState<string | null>(null);

  const search = (anyAmount: boolean) => {
    if (!row) return;
    setLoading(true);
    start(async () => {
      const res = await findTransferCandidates(row.id, {
        dayWindow: anyAmount ? 30 : 7,
        anyAmount,
      });
      setLoading(false);
      if (!res.ok) {
        setError(res.error ?? "Could not search for matches.");
        return;
      }
      setCandidates(res.candidates);
      setWidened(anyAmount);
      // Nothing nearby means the other statement probably isn't imported.
      if (res.candidates.length === 0 && !anyAmount) setMode("pick");
    });
  };

  useEffect(() => {
    if (!row) return;
    setPicked(null);
    setDestination("");
    setError(null);
    setMode("match");
    setWidened(false);
    setCandidates([]);
    search(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  if (!row) return null;

  const sources = [
    ...refData.accounts
      .filter((a) => a.id !== row.account_id)
      .map((a) => ({ value: `acc:${a.id}`, label: a.name, group: "Accounts" })),
    ...refData.cards
      .filter((c) => c.id !== row.credit_card_id)
      .map((c) => ({ value: `card:${c.id}`, label: c.name, group: "Cards" })),
  ];

  const chosen = candidates.find((c) => c.id === picked) ?? null;
  const canSave = mode === "match" ? Boolean(picked) : Boolean(destination);

  // Which way the money actually moved, for the preview line.
  const outName =
    row.type === "expense" ? row.source_name : chosen?.source_name ?? destinationLabel();
  const inName =
    row.type === "expense" ? chosen?.source_name ?? destinationLabel() : row.source_name;

  function destinationLabel() {
    return sources.find((s) => s.value === destination)?.label ?? "…";
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await convertToTransfer(
        row!.id,
        mode === "match" ? { mergeWithId: picked! } : { destination }
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Convert to transfer"
      description="Money moving between your own accounts, so it stops counting as spending."
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !canSave}>
            {busy ? "Saving…" : mode === "match" ? "Merge into one transfer" : "Convert to transfer"}
          </button>
        </>
      }
    >
      {/* ------------------------------------------------ the row itself */}
      <div
        className="flex items-center gap-3 p-3 rounded-lg mb-4"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <span style={{ color: "var(--text-muted)" }}>
          <IconSwap size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold m-0 truncate">{row.merchant ?? "Transaction"}</p>
          <p className="text-[11px] m-0" style={{ color: "var(--text-muted)" }}>
            {row.source_name} · {formatDateFull(row.txn_date)} ·{" "}
            {row.type === "expense" ? "money out" : "money in"}
          </p>
        </div>
        <span className="text-[14px] font-semibold tnum">{formatINR(row.amount)}</span>
      </div>

      {/* --------------------------------------------------- mode switch */}
      <div
        className="grid grid-cols-2 gap-1 p-1 mb-4"
        style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
        role="radiogroup"
        aria-label="How to convert"
      >
        {(
          [
            ["match", `Match a transaction${candidates.length ? ` (${candidates.length})` : ""}`],
            ["pick", "No match — pick the account"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className="h-8 text-xs font-semibold rounded-md transition-colors"
            style={{
              background: mode === value ? "var(--accent)" : "transparent",
              color: mode === value ? "var(--accent-fg)" : "var(--text-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============================================== match an existing */}
      {mode === "match" && (
        <div>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 52 }} />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm font-medium m-0 mb-1">No matching transaction found</p>
              <p className="text-xs m-0 mb-4" style={{ color: "var(--text-muted)" }}>
                {widened
                  ? "Nothing in the opposite direction on another account within 30 days."
                  : "Nothing with a similar amount within 7 days on another account."}
              </p>
              <div className="flex gap-2 justify-center">
                {!widened && (
                  <button className="btn btn-sm" onClick={() => search(true)} disabled={busy}>
                    Search wider
                  </button>
                )}
                <button className="btn btn-sm btn-primary" onClick={() => setMode("pick")}>
                  Just pick the account
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[11px] mb-2 m-0" style={{ color: "var(--text-muted)" }}>
                Pick the other half of this movement. The two rows become one
                transfer and the row you pick is removed.
              </p>

              <ul className="list-none p-0 m-0 space-y-1.5" role="radiogroup" aria-label="Matching transactions">
                {candidates.map((c) => {
                  const on = picked === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPicked(on ? null : c.id)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors"
                        style={{
                          border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                          background: on ? "var(--accent-soft)" : "var(--surface)",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                          {c.source_kind === "card" ? <IconCard size={16} /> : <IconWallet size={16} />}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium truncate">
                            {c.merchant ?? "Transaction"}
                          </span>
                          <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {c.source_name} · {formatDateFull(c.txn_date)}
                            {c.day_gap > 0 && ` · ${c.day_gap} day${c.day_gap === 1 ? "" : "s"} apart`}
                          </span>
                        </span>

                        <span className="text-right flex-shrink-0">
                          <span className="block text-[13px] font-semibold tnum">
                            {formatINR(c.amount)}
                          </span>
                          {!c.exact_amount && (
                            <span className="chip" style={{ color: "var(--warning)" }}>
                              differs
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {!widened && (
                <button
                  className="btn btn-sm btn-ghost mt-2"
                  onClick={() => search(true)}
                  disabled={busy}
                >
                  Not here? Search wider
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================ pick an account */}
      {mode === "pick" && (
        <div>
          <label className="label" htmlFor="ctt-dest">
            {row.type === "expense" ? "Where did the money go?" : "Where did the money come from?"}
          </label>
          <select
            id="ctt-dest"
            className="select"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Select…</option>
            <optgroup label="Accounts">
              {sources.filter((s) => s.group === "Accounts").map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cards">
              {sources.filter((s) => s.group === "Cards").map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-[11px] mt-2 m-0" style={{ color: "var(--text-muted)" }}>
            Use this when the other statement isn&apos;t in the app. This single row
            becomes the whole transfer — nothing is added to the other account, but
            its balance still moves.
          </p>
        </div>
      )}

      {/* --------------------------------------------------- what happens */}
      {canSave && (
        <div
          className="flex items-center gap-2 mt-4 p-3 rounded-lg text-[12px] animate-in"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <span className="font-semibold">{outName}</span>
          <IconArrowRight size={14} />
          <span className="font-semibold">{inName}</span>
          <span className="tnum ml-auto font-semibold">
            {formatINR(chosen && row.type !== "expense" ? chosen.amount : row.amount)}
          </span>
        </div>
      )}

      {chosen && !chosen.exact_amount && (
        <p
          className="flex items-start gap-2 text-[12px] mt-3 px-3 py-2 rounded-md m-0"
          style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
        >
          <IconAlert size={14} />
          <span>
            The two amounts differ ({formatINR(row.amount)} and {formatINR(chosen.amount)}).
            The transfer will use the amount that left the account. Check this is
            really the same movement.
          </span>
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs px-3 py-2 rounded-md mt-3 m-0"
          style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
        >
          {error}
        </p>
      )}
    </Sheet>
  );
}
