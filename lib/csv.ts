/**
 * CSV parsing + bank-format normalization.
 *
 * Indian bank and card exports come in two broad shapes:
 *
 *   split-amount    Date | Narration | Withdrawal | Deposit
 *                   the column the number sits in tells you the direction
 *
 *   single-amount   Date | Description | Amount | Debit/Credit | ...
 *                   one number, and a separate marker column names the direction
 *
 * Rather than maintain a per-bank parser, this sniffs the header row.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export interface NormalizedRow {
  /** Always set: rows whose date could not be parsed are dropped. */
  date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  /** The file's own category, when it has such a column. */
  csvCategory: string;
  raw: string[];
}

export interface ColumnMap {
  date: number;
  description: number;
  /** Amount columns — only meaningful in the split-amount shape. */
  debit: number;
  credit: number;
  /** Single amount column. */
  amount: number;
  /** Marker column naming the direction ("Debit/Credit", "Dr/Cr", "Type"). */
  drcr: number;
  /** The file's own category column, used as a suggestion. */
  category: number;
}

/** RFC4180-ish: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field.trim());
  if (row.some((c) => c !== "")) rows.push(row);

  // Bank exports often prepend "Statement of account" preamble lines. The real
  // header is the first row that looks like one and has the most columns.
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const score = headerScore(rows[i]);
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  }

  return {
    headers: rows[headerIdx] ?? [],
    rows: rows.slice(headerIdx + 1),
  };
}

function headerScore(row: string[]): number {
  const joined = row.join(" ").toLowerCase();
  let score = row.filter((c) => c !== "").length;
  if (/date/.test(joined)) score += 5;
  if (/narration|description|particulars|remarks|details/.test(joined)) score += 5;
  if (/debit|credit|withdrawal|deposit|amount/.test(joined)) score += 5;
  return score;
}

const RE = {
  date: /^(txn|transaction|value|posting|tran\.?)?\s*date/i,
  description: /narration|description|particulars|remarks|details|merchant|payee/i,
  debit: /debit|withdrawal|withdrawl|dr\.?\s*amount|paid out|outflow/i,
  credit: /credit|deposit|cr\.?\s*amount|paid in|inflow/i,
  amount: /^amount|^amt|amount\s*\(/i,
  category: /^categor/i,
  /** A column that *names* the direction rather than holding a number. */
  directionStrong:
    /^\s*(debit\s*[/|-]\s*credit|credit\s*[/|-]\s*debit|dr\s*[/|-]\s*cr|cr\s*[/|-]\s*dr|dr\s*or\s*cr|debit\s*or\s*credit|drcr|indicator|direction)\s*$/i,
  directionWeak: /\btype\b|indicator/i,
};

export function detectColumns(headers: string[]): ColumnMap {
  const h = headers.map((x) => x.trim());

  // A header matching BOTH the debit and the credit pattern is not an amount
  // column at all — it is a combined marker like "Debit/Credit". Treating it
  // as two amount columns is how every row silently became a debit.
  const combined = h.findIndex(
    (x) => RE.directionStrong.test(x) || (RE.debit.test(x) && RE.credit.test(x))
  );

  // Prefer an explicit Debit/Credit column over a vague "Transaction type",
  // which usually holds the instrument (UPI, NEFT, POS), not the direction.
  const drcr = combined >= 0 ? combined : h.findIndex((x) => RE.directionWeak.test(x));

  const usable = (i: number) => i !== combined && i !== drcr;
  const find = (re: RegExp) => h.findIndex((x, i) => usable(i) && re.test(x));

  const map: ColumnMap = {
    date: find(RE.date),
    description: find(RE.description),
    debit: find(RE.debit),
    credit: find(RE.credit),
    amount: find(RE.amount),
    drcr,
    category: find(RE.category),
  };

  if (map.date < 0) map.date = h.findIndex((x, i) => usable(i) && /date/i.test(x));

  if (map.description < 0) {
    // fall back to the first column that isn't a date, an amount or the marker
    map.description = h.findIndex(
      (x, i) =>
        usable(i) &&
        i !== map.date &&
        i !== map.amount &&
        i !== map.debit &&
        i !== map.credit &&
        i !== map.category
    );
  }

  return map;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Returns yyyy-mm-dd, or null if unparseable.
 * Ambiguous numeric dates are read as dd/mm/yyyy — Indian bank convention.
 */
export function parseBankDate(input: string): string | null {
  const s = (input || "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let day = +d;
    let month = +mo;
    if (day > 12 && month > 12) return null;
    // if the first part can't be a day, it was mm/dd
    if (day <= 12 && month > 12) [day, month] = [month, day];
    return iso(year, month, day);
  }

  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{2,4})/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return iso(year, month, +m[1]);
  }

  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Strips currency symbols, commas, brackets and trailing Dr/Cr markers. */
export function parseAmount(input: string): number {
  if (!input) return 0;
  const cleaned = input
    .replace(/[₹$,\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/(dr|cr)\.?$/i, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Reads a direction marker: "Credit", "CR", "C", "Deposit", "Debit", "DR"…
 * Returns null when the cell says nothing about direction (e.g. "UPI", "NEFT"),
 * so the caller can fall back rather than guess from an unrelated column.
 */
export function directionFromMarker(input: string): "debit" | "credit" | null {
  const s = (input || "").trim().toLowerCase();
  if (!s) return null;

  if (/^(c|cr|crd|credit|deposit|income|in|inward|received)\b/.test(s)) return "credit";
  if (/^(d|dr|debit|withdrawal|withdraw|expense|out|outward|paid)\b/.test(s)) return "debit";
  if (/\bcredit\b|\bdeposit\b|\bcr\b/.test(s)) return "credit";
  if (/\bdebit\b|\bwithdraw\w*\b|\bdr\b/.test(s)) return "debit";
  return null;
}

export function normalizeRows(parsed: ParsedCsv, map: ColumnMap): NormalizedRow[] {
  const out: NormalizedRow[] = [];
  const hasSplitAmounts = map.debit >= 0 && map.credit >= 0 && map.debit !== map.credit;

  for (const raw of parsed.rows) {
    const cell = (i: number) => (i >= 0 ? raw[i] ?? "" : "");

    const date = parseBankDate(cell(map.date));
    const description = cell(map.description) || "(no description)";

    let amount = 0;
    let direction: "debit" | "credit" = "debit";

    const debit = hasSplitAmounts ? parseAmount(cell(map.debit)) : 0;
    const credit = hasSplitAmounts ? parseAmount(cell(map.credit)) : 0;

    if (debit > 0 || credit > 0) {
      // Split-amount shape: whichever column holds the number decides.
      if (debit > 0) {
        amount = debit;
        direction = "debit";
      } else {
        amount = credit;
        direction = "credit";
      }
    } else {
      // Single-amount shape: the marker column decides, then the sign of the
      // number, and failing both we assume a debit — which is what statements
      // overwhelmingly contain.
      const rawAmount = cell(map.amount) || cell(map.debit) || cell(map.credit);
      amount = parseAmount(rawAmount);

      const negative = /^\s*-/.test(rawAmount) || /^\s*\(.*\)\s*$/.test(rawAmount);
      const marked = directionFromMarker(cell(map.drcr)) ?? directionFromMarker(rawAmount);

      if (marked) direction = marked;
      else if (negative) direction = "debit";
      else direction = "debit";
    }

    if (!date || amount <= 0) continue;
    out.push({ date, description, amount, direction, csvCategory: cell(map.category), raw });
  }

  return out;
}
