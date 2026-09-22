import { IconAlert } from "./Icons";

/**
 * Shown instead of the app when Supabase isn't reachable — a blank dashboard
 * with a stack trace in the console is a bad first five minutes.
 */
export function SetupNotice({ kind, detail }: { kind: "env" | "query"; detail?: string }) {
  const envMissing = kind === "env";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-xl p-6 sm:p-8">
        <div
          className="flex items-center justify-center rounded-full mb-4"
          style={{ width: 40, height: 40, background: "var(--warning-bg)", color: "var(--warning)" }}
        >
          <IconAlert size={20} />
        </div>

        <h1 className="text-lg font-semibold mb-1">
          {envMissing ? "Connect your Supabase project" : "Supabase is configured, but the query failed"}
        </h1>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
          {envMissing
            ? "The app needs a database before it can show anything."
            : "The credentials were found, but reading from the database did not work. The most likely cause is that the schema has not been created yet."}
        </p>

        <ol className="space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
          <li>
            <strong style={{ color: "var(--text)" }}>1. Create a Supabase project</strong> at
            supabase.com, then open the SQL Editor.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>2. Run the schema</strong> — paste{" "}
            <code>supabase/schema.sql</code>, then <code>supabase/seed.sql</code> for sample data.
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>3. Set the environment variables</strong> in{" "}
            <code>.env.local</code>:
            <pre
              className="mt-2 p-3 rounded-md text-xs overflow-x-auto"
              style={{ background: "var(--surface-2)", color: "var(--text)" }}
            >
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
APP_PASSWORD=<password for the app>`}
            </pre>
          </li>
          <li>
            <strong style={{ color: "var(--text)" }}>4. Restart the dev server.</strong>
          </li>
        </ol>

        {detail && (
          <div className="mt-5">
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
              Error returned
            </p>
            <pre
              className="p-3 rounded-md text-xs overflow-x-auto"
              style={{ background: "var(--expense-bg)", color: "var(--expense)" }}
            >
              {detail}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}
