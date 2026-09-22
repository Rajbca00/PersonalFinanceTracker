"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount, saveAccount, saveCard } from "@/lib/actions";
import type { AccountWithBalance, CreditCardWithBalance } from "@/lib/types";
import { ConfirmDialog, Sheet } from "./Sheet";
import { IconEdit, IconPlus, IconTrash } from "./Icons";

type Kind = "account" | "card";

export function AccountManagerButtons({
  account,
  card,
}: {
  account?: AccountWithBalance;
  card?: CreditCardWithBalance;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const kind: Kind = card ? "card" : "account";
  const id = card?.id ?? account?.id ?? "";
  const name = card?.name ?? account?.name ?? "";

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${name}`}
          title="Edit"
        >
          <IconEdit size={14} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--expense)" }}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${name}`}
          title="Delete"
        >
          <IconTrash size={14} />
        </button>
      </div>

      <AccountSheet
        open={editing}
        onClose={() => setEditing(false)}
        kind={kind}
        account={account}
        card={card}
      />

      <ConfirmDialog
        open={confirming}
        title={`Delete ${name}?`}
        message={`Every transaction on ${name} will be deleted too. This cannot be undone.`}
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const res = await deleteAccount(id, kind);
            if (!res.ok) alert(res.error);
            setConfirming(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

export function AddAccountButton({ kind }: { kind: Kind }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <IconPlus size={14} />
        {kind === "card" ? "Add card" : "Add account"}
      </button>
      <AccountSheet open={open} onClose={() => setOpen(false)} kind={kind} />
    </>
  );
}

function AccountSheet({
  open,
  onClose,
  kind,
  account,
  card,
}: {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  account?: AccountWithBalance;
  card?: CreditCardWithBalance;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editingId = card?.id ?? account?.id ?? null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const res =
      kind === "card" ? await saveCard(editingId, fd) : await saveAccount(editingId, fd);

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const title = editingId
    ? `Edit ${kind === "card" ? "card" : "account"}`
    : kind === "card"
      ? "Add credit card"
      : "Add account";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="account-form"
            className="btn btn-primary"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="account-form" onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="label" htmlFor="af-name">
            Name
          </label>
          <input
            id="af-name"
            name="name"
            className="input"
            required
            data-autofocus
            defaultValue={card?.name ?? account?.name ?? ""}
            placeholder={kind === "card" ? "HDFC Credit Card" : "HDFC Savings"}
          />
        </div>

        {kind === "account" ? (
          <>
            <div>
              <label className="label" htmlFor="af-type">
                Type
              </label>
              <select
                id="af-type"
                name="type"
                className="select"
                defaultValue={account?.type ?? "savings"}
              >
                <option value="savings">Savings</option>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="af-inst">
                Institution
              </label>
              <input
                id="af-inst"
                name="institution"
                className="input"
                defaultValue={account?.institution ?? ""}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label" htmlFor="af-open">
                Opening balance
              </label>
              <input
                id="af-open"
                name="opening_balance"
                type="number"
                step="0.01"
                className="input tnum"
                defaultValue={account?.opening_balance ?? 0}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                The balance before any transaction below was recorded.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="af-provider">
                Bank / provider
              </label>
              <input
                id="af-provider"
                name="provider"
                className="input"
                defaultValue={card?.provider ?? ""}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label" htmlFor="af-limit">
                Credit limit
              </label>
              <input
                id="af-limit"
                name="credit_limit"
                type="number"
                step="0.01"
                className="input tnum"
                defaultValue={card?.credit_limit ?? ""}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="label" htmlFor="af-outstanding">
                Opening outstanding
              </label>
              <input
                id="af-outstanding"
                name="opening_outstanding"
                type="number"
                step="0.01"
                className="input tnum"
                defaultValue={card?.opening_outstanding ?? 0}
              />
            </div>
          </>
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={card?.is_active ?? account?.is_active ?? true}
          />
          Active
        </label>

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
