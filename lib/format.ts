/** Indian digit grouping: 1,25,000 rather than 125,000. */
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainIN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * ₹1,25,000 — or ₹1,25,000.50 when there are paise, since silently
 * rounding someone's money away is worse than an extra two digits.
 */
export function formatINR(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return Number.isInteger(n) ? inrWhole.format(n) : inrPaise.format(n);
}

/** Always whole rupees — for chart axes and dense tables. */
export function formatINRWhole(value: number | string | null | undefined): string {
  return inrWhole.format(toNumber(value));
}

/** ₹1.2L / ₹12.5K — for tight spaces like axis ticks. */
export function formatINRCompact(value: number | string | null | undefined): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10000000) return `${sign}₹${round1(abs / 10000000)}Cr`;
  if (abs >= 100000) return `${sign}₹${round1(abs / 100000)}L`;
  if (abs >= 1000) return `${sign}₹${round1(abs / 1000)}K`;
  return `${sign}₹${plainIN.format(abs)}`;
}

/** Signed, for deltas: +₹35,000 / -₹8,500 */
export function formatSigned(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return (n > 0 ? "+" : "") + formatINR(n);
}

export function formatNumber(value: number | string | null | undefined): string {
  return plainIN.format(toNumber(value));
}

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

// ---------------------------------------------------------------- dates

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parses a yyyy-mm-dd date as a *local* calendar date. `new Date("2026-09-22")`
 * parses as UTC and can land on the 21st in western timezones, which would
 * quietly put transactions in the wrong month.
 */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "Sep 22" */
export function formatDayShort(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "22 Sep 2026" */
export function formatDateFull(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "September 2026" */
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: toISODate(new Date(year, month, 1)),
    to: toISODate(new Date(year, month + 1, 0)),
  };
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
