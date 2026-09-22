import Link from "next/link";
import { IconLogout } from "@/components/Icons";
import { ThemeSettings } from "@/components/ThemeSettings";
import { PageHeader, Panel } from "@/components/Ui";
import { logoutAction } from "@/lib/actions";
import { gateEnabled } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ref = await getRefData();
  const gated = gateEnabled();

  const counts = [
    ["Accounts", ref.accounts.length],
    ["Cards", ref.cards.length],
    ["Buckets", ref.buckets.length],
    ["Categories", ref.categories.length],
    ["Trips & events", ref.events.length],
  ] as const;

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Theme">
          <ThemeSettings />
        </Panel>

        <div className="space-y-4">
          <Panel title="Your data">
            <dl className="space-y-2.5 m-0">
              {counts.map(([label, n]) => (
                <div key={label} className="flex items-center justify-between">
                  <dt className="text-[13px] m-0" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </dt>
                  <dd className="text-[13px] font-semibold tnum m-0">{formatNumber(n)}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Link href="/settings/categories" className="btn btn-sm no-underline">
                Manage categories
              </Link>
              <Link href="/buckets" className="btn btn-sm no-underline">
                Manage buckets
              </Link>
              <Link href="/accounts" className="btn btn-sm no-underline">
                Manage accounts
              </Link>
            </div>
          </Panel>

          <Panel title="Access">
            {gated ? (
              <>
                <p className="text-[13px] m-0 mb-3" style={{ color: "var(--text-muted)" }}>
                  This app is protected by a shared password. Signing out clears the
                  session on this device.
                </p>
                <form action={logoutAction}>
                  <button type="submit" className="btn">
                    <IconLogout size={15} />
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <p
                className="text-[13px] px-3 py-2.5 rounded-md m-0"
                style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
              >
                No password is set, so anyone who can reach this URL can read and
                change your financial data. Set <code>APP_PASSWORD</code> in your
                environment before deploying this anywhere public.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
