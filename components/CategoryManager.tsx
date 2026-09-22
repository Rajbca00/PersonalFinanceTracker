"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCategory, saveCategory } from "@/lib/actions";
import type { Category, CategoryKind } from "@/lib/types";
import { ConfirmDialog, Sheet } from "./Sheet";
import { IconEdit, IconPlus, IconTrash } from "./Icons";

export function AddCategoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <IconPlus size={14} />
        Add category
      </button>
      <CategorySheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CategoryActions({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${category.name}`}
        >
          <IconEdit size={14} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--expense)" }}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${category.name}`}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <CategorySheet open={editing} onClose={() => setEditing(false)} category={category} />

      <ConfirmDialog
        open={confirming}
        title={`Delete ${category.name}?`}
        message="Transactions in this category are kept — they become uncategorized."
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const res = await deleteCategory(category.id);
            if (!res.ok) alert(res.error);
            setConfirming(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

function CategorySheet({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category?: Category;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveCategory(category?.id ?? null, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
    onClose();
  }

  const kinds: { value: CategoryKind; label: string; hint: string }[] = [
    { value: "expense", label: "Expense", hint: "Money going out" },
    { value: "income", label: "Income", hint: "Money coming in" },
    { value: "transfer", label: "Transfer", hint: "Between your own accounts" },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={category ? "Edit category" : "Add category"}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="label" htmlFor="cat-name">
            Name
          </label>
          <input
            id="cat-name"
            name="name"
            className="input"
            required
            data-autofocus
            defaultValue={category?.name ?? ""}
            placeholder="e.g. Grocery"
          />
        </div>

        <div>
          <label className="label" htmlFor="cat-kind">
            Applies to
          </label>
          <select
            id="cat-kind"
            name="kind"
            className="select"
            defaultValue={category?.kind ?? "expense"}
          >
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} — {k.hint}
              </option>
            ))}
          </select>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
            This decides which transactions can use the category, so an expense
            can&apos;t be filed under an income category by mistake.
          </p>
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
