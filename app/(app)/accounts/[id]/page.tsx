import { notFound } from "next/navigation";
import { AccountManagerButtons } from "@/components/AccountManager";
import { AddButton } from "@/components/AddButton";
import { Pagination } from "@/components/Pagination";
import { TransactionList } from "@/components/TransactionList";
import { PageHeader, Panel, StatCard } from "@/components/Ui";
import { getRefData, getTransactions } from "@/lib/queries";

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

  const { rows, total, page: current, pageSize } = await getTransactions(
    { accountId: id, page: Number(page) || 1, pageSize: 50 },
    ref
  );

  // Lifetime totals for this account, derived from the same rows the view uses.
  const income = rows.filter((r) => r.type === "income" && r.account_id === id).reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === "expense" && r.account_id === id).reduce((s, r) => s + r.amount, 0);

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
        <TransactionList rows={rows} refData={ref} emptyAction={<AddButton label="Add transaction" />} />
      </Panel>

      <Pagination page={current} pageSize={pageSize} total={total} />
    </>
  );
}
