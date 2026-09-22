import Link from "next/link";
import { formatINR } from "@/lib/format";
import { IconArrowDown, IconArrowUp, IconInbox } from "./Icons";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
  padded = true,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div
          className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-[13px] font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

/**
 * Direction is shown with an arrow and a word as well as colour, so the
 * income/expense distinction survives colour blindness and greyscale printing.
 */
export function StatCard({
  label,
  value,
  tone,
  hint,
  delta,
}: {
  label: string;
  value: number;
  tone?: "income" | "expense" | "neutral";
  hint?: string;
  delta?: { pct: number; label: string } | null;
}) {
  const color =
    tone === "income" ? "var(--income)" : tone === "expense" ? "var(--expense)" : "var(--text)";

  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {tone === "income" && <IconArrowDown size={13} style={{ color }} />}
        {tone === "expense" && <IconArrowUp size={13} style={{ color }} />}
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--text-subtle)" }}
        >
          {label}
        </span>
      </div>

      <p className="text-[19px] sm:text-xl font-semibold tnum leading-tight" style={{ color }}>
        {formatINR(value)}
      </p>

      {(hint || delta) && (
        <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
          {delta && (
            <span
              className="tnum font-medium"
              style={{
                color:
                  delta.pct === 0
                    ? "var(--text-muted)"
                    : delta.pct > 0
                      ? "var(--expense)"
                      : "var(--income)",
              }}
            >
              {delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "—"}{" "}
              {Math.abs(delta.pct).toFixed(0)}%
            </span>
          )}
          {delta ? delta.label : hint}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div
        className="flex items-center justify-center rounded-full mb-3"
        style={{ width: 44, height: 44, background: "var(--surface-2)", color: "var(--text-subtle)" }}
      >
        {icon ?? <IconInbox size={22} />}
      </div>
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs mb-4 max-w-xs" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="px-4 py-3 rounded-lg text-xs"
      role="alert"
      style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
    >
      {message}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} />;
}

export function LinkButton({
  href,
  children,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link href={href} className={`btn no-underline ${primary ? "btn-primary" : ""}`}>
      {children}
    </Link>
  );
}
