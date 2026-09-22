import { AddCategoryButton, CategoryActions } from "@/components/CategoryManager";
import { IconTag } from "@/components/Icons";
import { EmptyState, PageHeader, Panel } from "@/components/Ui";
import { getRefData } from "@/lib/queries";
import type { CategoryKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUPS: { kind: CategoryKind; title: string; blurb: string }[] = [
  { kind: "expense", title: "Expense categories", blurb: "Where money goes" },
  { kind: "income", title: "Income categories", blurb: "Where money comes from" },
  {
    kind: "transfer",
    title: "Transfer categories",
    blurb: "Movements between your own accounts — never counted as income or expense",
  },
];

export default async function CategoriesPage() {
  const ref = await getRefData();

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Shared across every bucket"
        actions={<AddCategoryButton />}
      />

      {ref.categories.length === 0 ? (
        <Panel>
          <EmptyState
            title="No categories yet"
            message="Add a few categories so transactions can be grouped on the dashboard."
            icon={<IconTag size={22} />}
            action={<AddCategoryButton />}
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const items = ref.categories.filter((c) => c.kind === g.kind);
            if (items.length === 0) return null;

            return (
              <Panel key={g.kind} title={g.title} padded={false}>
                <p
                  className="text-[11px] px-4 sm:px-5 pt-3 m-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  {g.blurb}
                </p>
                <ul className="list-none m-0 p-0 pt-2">
                  {items.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 px-4 sm:px-5 py-2.5"
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <span
                        className="flex items-center justify-center rounded-md flex-shrink-0"
                        style={{
                          width: 28,
                          height: 28,
                          background: "var(--surface-2)",
                          color: "var(--text-muted)",
                        }}
                      >
                        <IconTag size={14} />
                      </span>
                      <span className="flex-1 text-[13px] font-medium truncate">
                        {c.name}
                        {c.is_system && <span className="chip ml-2">System</span>}
                      </span>
                      <CategoryActions category={c} />
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
