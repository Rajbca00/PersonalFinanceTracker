/**
 * CSV parsing + bank-format normalization.
 *
 * Indian bank and card exports differ wildly: HDFC uses "Narration" with
 * separate Withdrawal/Deposit columns, ICICI uses "Transaction Remarks" with
 * Debit/Credit, card statements often carry one Amount column plus a Dr/Cr
 * marker. Rather than maintain a per-bank parser, this sniffs the header row.
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
  raw: string[];
}

export interface ColumnMap {
  date: number;
  description: number;
  debit: number;
  credit: number;
  amount: number;
  drcr: number;
}

/** RFC4180-ish: handles quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
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
  description: /narration|description|particulars|remarks|details|merchant|transaction details/i,
  debit: /debit|withdrawal|withdrawl|dr amount|paid out/i,
  credit: /credit|deposit|cr amount|paid in/i,
  amount: /^amount|amount \(inr\)|^amt/i,
  drcr: /dr\s*\/?\s*cr|cr\s*\/?\s*dr|type|indicator/i,
};

export function detectColumns(headers: string[]): ColumnMap {
  const find = (re: RegExp) => headers.findIndex((h) => re.test(h.trim()));
  const map: ColumnMap = {
    date: find(RE.date),
    description: find(RE.description),
    debit: find(RE.debit),
    credit: find(RE.credit),
    amount: find(RE.amount),
    drcr: find(RE.drcr),
  };

  // "Debit Card" style headers are descriptions, not amount columns.
  if (map.debit >= 0 && map.debit === map.description) map.debit = -1;
  if (map.date < 0) map.date = headers.findIndex((h) => /date/i.test(h));
  if (map.description < 0) {
    // fall back to the widest non-numeric column
    map.description = headers.findIndex(
      (h, i) => i !== map.date && !RE.debit.test(h) && !RE.credit.test(h) && !RE.amount.test(h)
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
    let [, d, mo, y] = m;
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let day = +d;
    let month = +mo;
    // if the first part can't be a day, it was mm/dd
    if (day > 12 && month > 12) return null;
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

/** Strips ₹, commas, spaces and trailing Dr/Cr markers. */
export function parseAmount(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[₹$,\s]/g, "").replace(/(dr|cr)\.?$/i, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

export function normalizeRows(parsed: ParsedCsv, map: ColumnMap): NormalizedRow[] {
  const out: NormalizedRow[] = [];

  for (const raw of parsed.rows) {
    const cell = (i: number) => (i >= 0 ? raw[i] ?? "" : "");

    const date = parseBankDate(cell(map.date));
    const description = cell(map.description) || "(no description)";

    let amount = 0;
    let direction: "debit" | "credit" = "debit";

    const debit = parseAmount(cell(map.debit));
    const credit = parseAmount(cell(map.credit));

    if (debit > 0 || credit > 0) {
      if (debit > 0) {
        amount = debit;
        direction = "debit";
      } else {
        amount = credit;
        direction = "credit";
      }
    } else {
      const rawAmount = cell(map.amount);
      amount = parseAmount(rawAmount);
      const marker = (cell(map.drcr) || rawAmount).toLowerCase();
      const negative = /^-/.test(rawAmount.trim());
      // An explicit Cr marker wins, but a leading minus always means money
      // out. Anything unmarked is treated as a debit, which is what bank and
      // card statements overwhelmingly contain.
      if (!negative && /\bcr\b|credit|deposit/.test(marker)) direction = "credit";
      else direction = "debit";
    }

    if (!date || amount <= 0) continue;
    out.push({ date, description, amount, direction, raw });
  }

  return out;
}
