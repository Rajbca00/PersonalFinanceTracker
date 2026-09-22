import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, gateEnabled, verifySessionToken } from "@/lib/auth";

/**
 * Checked here rather than via lib/db so the Edge bundle doesn't pull in the
 * Postgres driver just to read one environment variable.
 */
function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Without a database every page would throw during render, so route to the
  // setup instructions before any page component runs. Layouts can't do this:
  // pages render in parallel with them and throw first.
  if (!dbConfigured()) {
    if (pathname === "/setup") return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/setup") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!gateEnabled()) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();

  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|csv|svg)$).*)"],
};
