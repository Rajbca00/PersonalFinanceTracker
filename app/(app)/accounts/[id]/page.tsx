import { notFound } from "next/navigation";
import { AccountManagerButtons } from "@/components/AccountManager";
import { AddButton } from "@/components/AddButton";
import { Pagination } from "@/components/Pagination";
import { TransactionList } from "@/components/TransactionList";
import { PageHeader, Panel, StatCard } from "@/components/Ui";
import { getAccountLedger, getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;

  const ref = await getRefData();
  const account = ref.accounts.find((a) => a.id === id);
  if (!account) notFound();

  const { rows, total, page: current, pageSize } = await getAccountLedger(
    id,
    account.opening_balance,
    Number(page) || 1,
    50,
    ref
  );

  // Totals for what's on screen, from the same rows the ledger shows. delta is
  // this account's signed view of each row, so a transfer out counts as out.
  const income = rows.reduce((s, r) => s + Math.max(r.delta ?? 0, 0), 0);
  const expense = rows.reduce((s, r) => s + Math.max(-(r.delta ?? 0), 0), 0);

  return (
    <>
      <PageHeader
        title={account.name}
        subtitle={[account.institution, account.type].filter(Boolean).join(" · ")}
        actions={
          <>
            <AccountManagerButtons account={account} />
            <span className="hidden sm:block">
              <AddButton />
            </span>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Current balance" value={account.current_balance} hint="Opening + in − out" />
        <StatCard label="Opening balance" value={account.opening_balance} hint="Before any transaction" />
        <StatCard label="Money in" value={income} tone="income" hint="On this page" />
        <StatCard label="Money out" value={expense} tone="expense" hint="On this page" />
      </div>

      <Panel
        title={`Transactions (${total.toLocaleString("en-IN")})`}
        padded={false}
      >
        <TransactionList rows={rows} refData={ref} ledger="account" emptyAction={<AddButton label="Add transaction" />} />
      </Panel>

      <Pagination page={current} pageSize={pageSize} total={total} />
    </>
  );
}
