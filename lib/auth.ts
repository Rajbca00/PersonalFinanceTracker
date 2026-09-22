/**
 * A deliberately small password gate.
 *
 * This app is meant to be deployed to a public Vercel URL with real financial
 * data behind it, so it should not be open to anyone who guesses the hostname.
 * This is a single shared password producing an HMAC-signed cookie — not user
 * accounts. If you ever need real multi-user access, move to Supabase Auth and
 * add RLS policies keyed on users.id.
 *
 * Runs on the Edge runtime, so it uses Web Crypto rather than node:crypto.
 */

export const SESSION_COOKIE = "pft_session";
const SESSION_DAYS = 30;

function enc(s: string): BufferSource {
  return new TextEncoder().encode(s) as unknown as BufferSource;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc(payload));
  return toBase64Url(sig);
}

/** Length-independent compare, so the signature can't be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authSecret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

/** No password configured -> the gate is off (convenient locally, flagged in the UI). */
export function gateEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export async function createSessionToken(): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = String(exp);
  const sig = await sign(payload, authSecret());
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await sign(payload, authSecret());
  if (!safeEqual(sig, expected)) return false;

  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return false;
  return safeEqual(input, expected);
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
