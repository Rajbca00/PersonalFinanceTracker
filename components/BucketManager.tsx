"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBucket, saveBucket } from "@/lib/actions";
import type { Bucket } from "@/lib/types";
import { ConfirmDialog, Sheet } from "./Sheet";
import { IconEdit, IconPlus, IconTrash } from "./Icons";

const COLORS = ["blue", "green", "purple", "teal", "amber", "rose", "slate"];

export function AddBucketButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <IconPlus size={14} />
        Add bucket
      </button>
      <BucketSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function BucketActions({ bucket }: { bucket: Bucket }) {
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
          aria-label={`Edit ${bucket.name}`}
        >
          <IconEdit size={14} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--expense)" }}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${bucket.name}`}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <BucketSheet open={editing} onClose={() => setEditing(false)} bucket={bucket} />

      <ConfirmDialog
        open={confirming}
        title={`Delete ${bucket.name}?`}
        message="Buckets holding transactions can't be deleted — move those transactions to another bucket first."
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const res = await deleteBucket(bucket.id);
            if (!res.ok) alert(res.error);
            setConfirming(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

function BucketSheet({
  open,
  onClose,
  bucket,
}: {
  open: boolean;
  onClose: () => void;
  bucket?: Bucket;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveBucket(bucket?.id ?? null, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={bucket ? "Edit bucket" : "Add bucket"}
      description="Every transaction belongs to exactly one bucket."
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="bucket-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="bucket-form" onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="label" htmlFor="bk-name">
            Name
          </label>
          <input
            id="bk-name"
            name="name"
            className="input"
            required
            data-autofocus
            defaultValue={bucket?.name ?? ""}
            placeholder="e.g. Personal"
          />
        </div>

        <div>
          <label className="label" htmlFor="bk-color">
            Colour
          </label>
          <select id="bk-color" name="color" className="select" defaultValue={bucket?.color ?? "slate"}>
            {COLORS.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
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
