"use client";

import { useEffect, useRef } from "react";
import { IconX } from "./Icons";

/**
 * One dialog primitive for the whole app: a centered modal on desktop, a
 * bottom sheet on mobile. Handles Escape, backdrop clicks, scroll locking and
 * focus return so individual screens don't each reinvent it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);

    // Focus the first real control, not the close button.
    const t = setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      (target ?? panelRef.current)?.focus();
    }, 30);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW = size === "sm" ? 420 : size === "lg" ? 880 : 560;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0"
        style={{ background: "rgb(0 0 0 / 0.45)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full overflow-hidden outline-none"
        style={{
          maxWidth: maxW,
          maxHeight: "92vh",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          boxShadow: "var(--shadow-lg)",
          animation: "sheet-up .22s cubic-bezier(.32,.72,0,1)",
          display: "flex",
          flexDirection: "column",
        }}
        data-sheet-panel
      >
        <div
          className="flex items-start justify-between gap-3 px-5 pt-4 pb-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {description && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {description}
              </p>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4" style={{ flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @media (min-width: 640px) {
          [data-sheet-panel] { border-radius: var(--radius-lg) !important; }
        }
      `}</style>
    </div>
  );
}

/** Destructive confirmations — never delete straight from a click. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
    </Sheet>
  );
}
