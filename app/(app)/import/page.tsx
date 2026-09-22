import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/Ui";
import { getRefData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ref = await getRefData();

  return (
    <>
      <PageHeader
        title="Import CSV"
        subtitle="Upload a bank or card statement. Nothing is saved until you confirm."
        actions={
          <a href="/sample-statement.csv" download className="btn no-underline">
            Download sample CSV
          </a>
        }
      />
      <ImportWizard ref={ref} />
    </>
  );
}
