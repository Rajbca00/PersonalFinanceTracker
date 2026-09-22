import { AppShell } from "@/components/AppShell";
import { SetupNotice } from "@/components/SetupNotice";
import { gateEnabled } from "@/lib/auth";
import { getRefData } from "@/lib/queries";
import type { RefData } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts redirects to /setup when credentials are missing, so reaching
  // here means they exist; this only catches a schema that hasn't been run.
  let ref: RefData;
  try {
    ref = await getRefData();
  } catch (e) {
    return <SetupNotice kind="query" detail={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <AppShell refData={ref} gated={gateEnabled()}>
      {children}
    </AppShell>
  );
}
