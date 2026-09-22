"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent, saveEvent } from "@/lib/actions";
import type { Bucket, TripEvent } from "@/lib/types";
import { ConfirmDialog, Sheet } from "./Sheet";
import { IconEdit, IconPlus, IconTrash } from "./Icons";

export function AddEventButton({ buckets }: { buckets: Bucket[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        <IconPlus size={14} />
        New trip or event
      </button>
      <EventSheet open={open} onClose={() => setOpen(false)} buckets={buckets} />
    </>
  );
}

export function EventActions({ event, buckets }: { event: TripEvent; buckets: Bucket[] }) {
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
          aria-label={`Edit ${event.name}`}
        >
          <IconEdit size={14} />
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: "var(--expense)" }}
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${event.name}`}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <EventSheet
        open={editing}
        onClose={() => setEditing(false)}
        event={event}
        buckets={buckets}
      />

      <ConfirmDialog
        open={confirming}
        title={`Delete ${event.name}?`}
        message="The transactions stay — they simply stop being linked to this event."
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          start(async () => {
            const res = await deleteEvent(event.id);
            if (!res.ok) alert(res.error);
            setConfirming(false);
            router.refresh();
          })
        }
      />
    </>
  );
}

function EventSheet({
  open,
  onClose,
  event,
  buckets,
}: {
  open: boolean;
  onClose: () => void;
  event?: TripEvent;
  buckets: Bucket[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveEvent(event?.id ?? null, new FormData(e.currentTarget));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={event ? "Edit trip or event" : "New trip or event"}
      description="A second way to slice spending, alongside categories."
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={onSubmit} className="space-y-3.5">
        <div>
          <label className="label" htmlFor="ev-name">
            Name
          </label>
          <input
            id="ev-name"
            name="name"
            className="input"
            required
            data-autofocus
            defaultValue={event?.name ?? ""}
            placeholder="e.g. Goa Trip"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ev-start">
              Start date
            </label>
            <input
              id="ev-start"
              name="start_date"
              type="date"
              className="input"
              defaultValue={event?.start_date ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="ev-end">
              End date
            </label>
            <input
              id="ev-end"
              name="end_date"
              type="date"
              className="input"
              defaultValue={event?.end_date ?? ""}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="ev-bucket">
            Bucket
          </label>
          <select
            id="ev-bucket"
            name="bucket_id"
            className="select"
            defaultValue={event?.bucket_id ?? ""}
          >
            <option value="">None</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="ev-desc">
            Description
          </label>
          <textarea
            id="ev-desc"
            name="description"
            className="textarea"
            defaultValue={event?.description ?? ""}
            placeholder="Optional"
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
