import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

/**
 * Neon serverless Postgres, over HTTP.
 *
 * The HTTP driver issues one request per query rather than holding a socket,
 * which is what you want on Vercel — serverless functions can't keep a
 * connection pool alive between invocations without exhausting Postgres.
 *
 * DATABASE_URL is a secret and is only ever read in server code (server
 * components, server actions, the proxy). It must never reach the browser,
 * which is why it has no NEXT_PUBLIC_ prefix.
 */
export function db(): NeonQueryFunction<false, false> {
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your " +
        "Neon connection string, then restart."
    );
  }

  cached = neon(url);
  return cached;
}

export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Only these columns can ever appear on the left of a SET or in an INSERT
 * column list. Everything else is passed as a bound parameter, so a column
 * name can never come from user input.
 */
export type Col = string;

/**
 * Builds "col1 = $1, col2 = $2" plus the matching parameter array.
 * Keys are checked against `allowed` so a caller can't smuggle in SQL.
 */
export function buildSet(
  patch: Record<string, unknown>,
  allowed: readonly string[],
  startIndex = 1
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.includes(key)) {
      throw new Error(`Refusing to update unknown column "${key}".`);
    }
    parts.push(`${key} = $${i++}`);
    params.push(value);
  }

  if (parts.length === 0) throw new Error("Nothing to update.");
  return { clause: parts.join(", "), params };
}
