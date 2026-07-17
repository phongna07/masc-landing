import { auth } from "@masc-landing/auth";
import { getDashboardTabSettings } from "@masc-landing/api/dashboard-tab-settings";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import Dashboard, { type DashboardTab } from "./dashboard";

export default async function AuthenticatedDashboard({ activeTab }: { activeTab: DashboardTab }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const tabSettings = await getDashboardTabSettings();
  if (activeTab.startsWith("round-") && !tabSettings[activeTab.slice(6) as keyof typeof tabSettings]) {
    redirect("/dashboard");
  }

  return <Dashboard session={session} activeTab={activeTab} tabSettings={tabSettings} />;
}
