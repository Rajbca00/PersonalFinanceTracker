"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { detectColumns, normalizeRows, parseCsv } from "./csv";
import { inferType, suggestByRules } from "./categorize";
import { getRefData } from "./queries";
import { toNumber } from "./format";
import type { StagedRow, TxnType } from "./types";

export interface PreviewResult {
  ok: boolean;
  error?: string;
  headers: string[];
  mapping: Record<string, string>;
  rows: StagedRow[];
  skipped: number;
}

function splitSource(value: string): { account_id: string | null; credit_card_id: string | null } {
  const [kind, id] = value.split(":");
  return kind === "card"
    ? { account_id: null, credit_card_id: id }
    : { account_id: id, credit_card_id: null };
}

/**
 * Step 2 + 3: parse the upload, normalize each row, suggest a category and
 * bucket, and flag anything that looks like it is already in the database.
 * Writes nothing.
 */
export async function previewCsv(csvText: string, source: string): Promise<PreviewResult> {
  const empty: PreviewResult = { ok: false, headers: [], mapping: {}, rows: [], skipped: 0 };

  try {
    if (!source) return { ...empty, error: "Choose the account or card this file came from." };

    const parsed = parseCsv(csvText);
    if (parsed.headers.length === 0) {
      return { ...empty, error: "That file has no readable rows." };
    }

    const map = detectColumns(parsed.headers);
    if (map.date < 0) {
      return {
        ...empty,
        headers: parsed.headers,
        error: "No date column found. Expected a header containing 'date'.",
      };
    }

    const normalized = normalizeRows(parsed, map);
    const skipped = parsed.rows.length - normalized.length;
    if (normalized.length === 0) {
      return {
        ...empty,
        headers: parsed.headers,
        error: "No rows had both a readable date and an amount.",
      };
    }

    const ref = await getRefData();
    const defaultBucket = ref.buckets.find((b) => b.name === "Personal") ?? ref.buckets[0];
    if (!defaultBucket) {
      return { ...empty, error: "Create at least one bucket before importing." };
    }

    // One query covers duplicate detection for the whole file.
    const dates = normalized.map((r) => r.date).sort();
    const { account_id, credit_card_id } = splitSource(source);

    const existing = (await db().query(
      `select id, txn_date::text as txn_date, amount::text as amount
       from transactions
       where txn_date >= $1 and txn_date <= $2
         and ${account_id ? "account_id" : "credit_card_id"} = $3`,
      [dates[0], dates[dates.length - 1], account_id ?? credit_card_id]
    )) as unknown as { id: string; txn_date: string; amount: string }[];

    const seen = new Map<string, string>();
    for (const e of existing) {
      seen.set(`${e.txn_date}|${toNumber(e.amount).toFixed(2)}`, e.id);
    }

    const rows: StagedRow[] = normalized.map((r, i) => {
      const s = suggestByRules(r.description, r.direction);
      const category = ref.categories.find((c) => c.name === s.categoryName) ?? null;
      const bucket = ref.buckets.find((b) => b.name === s.bucketName) ?? defaultBucket;
      const type: TxnType = inferType(r.direction, s.categoryName, ref.categories);

      return {
        key: `r${i}`,
        txn_date: r.date,
        merchant: s.merchant,
        rawDescription: r.description,
        amount: r.amount,
        type,
        category_id: category?.id ?? null,
        bucket_id: bucket.id,
        event_id: null,
        note: "",
        include: true,
        duplicateOf: seen.get(`${r.date}|${r.amount.toFixed(2)}`) ?? null,
        confidence: s.confidence,
      };
    });

    const headerName = (i: number) => (i >= 0 ? parsed.headers[i] ?? "—" : "—");

    return {
      ok: true,
      headers: parsed.headers,
      mapping: {
        Date: headerName(map.date),
        Description: headerName(map.description),
        Debit: headerName(map.debit),
        Credit: headerName(map.credit),
        Amount: headerName(map.amount),
      },
      rows,
      skipped,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Could not read that file." };
  }
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  imported: number;
}

/** Step 4: write the rows the user kept. */
export async function commitImport(
  rows: StagedRow[],
  source: string,
  fileName: string
): Promise<ImportResult> {
  try {
    const keep = rows.filter((r) => r.include);
    if (keep.length === 0) return { ok: false, error: "No rows selected.", imported: 0 };

    const { account_id, credit_card_id } = splitSource(source);
    const sql = db();

    // The batch id is generated here rather than read back from an INSERT, so
    // the batch row and its transactions can go in as one atomic statement
    // pair — a half-finished import would be worse than a failed one.
    const batchId = crypto.randomUUID();

    // A transfer needs a destination, which a CSV can't tell us. Anything the
    // rules guessed as a transfer is imported as a plain expense/income so the
    // check constraint holds; the user can convert it afterwards.
    const cols = 11;
    const values: unknown[] = [];
    const tuples = keep.map((r, i) => {
      const b = i * cols;
      values.push(
        r.txn_date,
        r.type === "transfer" ? "expense" : r.type,
        r.amount,
        account_id,
        credit_card_id,
        r.bucket_id,
        r.category_id,
        r.event_id,
        r.merchant,
        r.note || null,
        r.rawDescription.slice(0, 200)
      );
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6},
               $${b + 7}, $${b + 8}, $${b + 9}, $${b + 10}, $${b + 11}, false, $BATCH)`;
    });

    // Every tuple shares the one batch id, bound as the final parameter.
    const batchParam = `$${values.length + 1}`;
    const tupleSql = tuples.join(", ").replaceAll("$BATCH", batchParam);
    values.push(batchId);

    await sql.transaction([
      sql.query(
        `insert into import_batches (id, source_name, account_id, credit_card_id, row_count, imported_count)
         values ($1, $2, $3, $4, $5, $6)`,
        [batchId, fileName, account_id, credit_card_id, rows.length, keep.length]
      ),
      sql.query(
        `insert into transactions (
           txn_date, type, amount, account_id, credit_card_id,
           bucket_id, category_id, event_id, merchant, note, external_ref,
           reviewed, import_batch_id
         ) values ${tupleSql}`,
        values
      ),
    ]);

    revalidatePath("/", "layout");
    return { ok: true, imported: keep.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Import failed.",
      imported: 0,
    };
  }
}
