import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

/**
 * Reached only via proxy.ts, when Supabase credentials are missing. Once they
 * are set, the proxy redirects this route back to the dashboard.
 */
export default function SetupPage() {
  return <SetupNotice kind="env" />;
}
