import { redirect } from "next/navigation";
import { gateEnabled } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // No password configured means the gate is off; there is nothing to log into.
  if (!gateEnabled()) redirect("/");

  const { next } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full" style={{ maxWidth: 360 }}>
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <span
            className="flex items-center justify-center rounded-lg font-bold"
            style={{ width: 32, height: 32, background: "var(--accent)", color: "var(--accent-fg)" }}
            aria-hidden="true"
          >
            ₹
          </span>
          <span className="font-semibold text-lg tracking-tight">Finance</span>
        </div>

        <div className="card p-6">
          <h1 className="text-base font-semibold mb-1">Sign in</h1>
          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
            Enter the app password to continue.
          </p>
          <LoginForm next={next ?? "/"} />
        </div>
      </div>
    </main>
  );
}
