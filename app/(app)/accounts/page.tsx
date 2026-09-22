import Link from "next/link";
import { AccountManagerButtons, AddAccountButton } from "@/components/AccountManager";
import { IconCard, IconWallet } from "@/components/Icons";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/Ui";
import { formatINR } from "@/lib/format";
import { getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const ref = await getRefData();

  const totalBalance = ref.accounts
    .filter((a) => a.is_active)
    .reduce((s, a) => s + a.current_balance, 0);
  const totalOutstanding = ref.cards
    .filter((c) => c.is_active)
    .reduce((s, c) => s + c.current_outstanding, 0);
  const totalLimit = ref.cards
    .filter((c) => c.is_active)
    .reduce((s, c) => s + (c.credit_limit ?? 0), 0);

  return (
    <>
      <PageHeader title="Accounts & cards" subtitle="Balances update as transactions are recorded" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total balance" value={totalBalance} hint="Across active accounts" />
        <StatCard
          label="Card outstanding"
          value={totalOutstanding}
          tone={totalOutstanding > 0 ? "expense" : "neutral"}
          hint="Across active cards"
        />
        <StatCard
          label="Available credit"
          value={Math.max(totalLimit - totalOutstanding, 0)}
          hint={totalLimit > 0 ? `Of ${formatINR(totalLimit)} limit` : "No limits set"}
        />
        <StatCard label="Net worth" value={totalBalance - totalOutstanding} hint="Balance minus card debt" />
      </div>

      <Panel
        title="Accounts"
        action={<AddAccountButton kind="account" />}
        className="mb-4"
        padded={false}
      >
        {ref.accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            message="Add a bank account, cash or wallet to start tracking."
            icon={<IconWallet size={22} />}
            action={<AddAccountButton kind="account" />}
          />
        ) : (
          <ul className="list-none m-0 p-0">
            {ref.accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 px-4 sm:px-5 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{ width: 34, height: 34, background: "var(--surface-2)", color: "var(--text-muted)" }}
                >
                  <IconWallet size={17} />
                </span>

                <Link
                  href={`/accounts/${a.id}`}
                  className="min-w-0 flex-1 no-underline"
                  style={{ color: "var(--text)" }}
                >
                  <span className="block text-[14px] font-medium truncate">
                    {a.name}
                    {!a.is_active && <span className="chip ml-2">Inactive</span>}
                  </span>
                  <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {a.institution ?? a.type} · opened at {formatINR(a.opening_balance)}
                  </span>
                </Link>

                <span className="text-[14px] font-semibold tnum whitespace-nowrap">
                  {formatINR(a.current_balance)}
                </span>

                <AccountManagerButtons account={a} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Credit cards" action={<AddAccountButton kind="card" />} padded={false}>
        {ref.cards.length === 0 ? (
          <EmptyState
            title="No cards yet"
            message="Add a credit card to track purchases and outstanding separately from your bank accounts."
            icon={<IconCard size={22} />}
            action={<AddAccountButton kind="card" />}
          />
        ) : (
          <ul className="list-none m-0 p-0">
            {ref.cards.map((c) => {
              const available = c.credit_limit === null ? null : c.credit_limit - c.current_outstanding;
              const usedPct =
                c.credit_limit && c.credit_limit > 0
                  ? Math.min(100, (c.current_outstanding / c.credit_limit) * 100)
                  : null;

              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 34, height: 34, background: "var(--surface-2)", color: "var(--text-muted)" }}
                  >
                    <IconCard size={17} />
                  </span>

                  <Link
                    href={`/cards/${c.id}`}
                    className="min-w-0 flex-1 no-underline"
                    style={{ color: "var(--text)" }}
                  >
                    <span className="block text-[14px] font-medium truncate">
                      {c.name}
                      {!c.is_active && <span className="chip ml-2">Inactive</span>}
                    </span>
                    <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {available === null
                        ? c.provider ?? "No limit set"
                        : `${formatINR(available)} available of ${formatINR(c.credit_limit!)}`}
                    </span>
                    {usedPct !== null && (
                      <span
                        className="block mt-1.5"
                        style={{ height: 4, borderRadius: 3, background: "var(--surface-2)", maxWidth: 180 }}
                      >
                        <span
                          className="block"
                          style={{
                            width: `${usedPct}%`,
                            height: "100%",
                            borderRadius: 3,
                            background: usedPct > 80 ? "var(--expense)" : "var(--accent)",
                          }}
                        />
                      </span>
                    )}
                  </Link>

                  <span
                    className="text-[14px] font-semibold tnum whitespace-nowrap"
                    style={{ color: c.current_outstanding > 0 ? "var(--expense)" : "var(--text)" }}
                  >
                    {formatINR(c.current_outstanding)}
                  </span>

                  <AccountManagerButtons card={c} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
