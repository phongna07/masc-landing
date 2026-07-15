import { auth } from "@masc-landing/auth";
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

  return <Dashboard session={session} activeTab={activeTab} />;
}
