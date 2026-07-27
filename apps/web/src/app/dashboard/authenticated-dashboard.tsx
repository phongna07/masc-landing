import { directAdmissionRounds, getAdmissionSettings } from "@masc-landing/api/admission-settings";
import { getDashboardTabSettings } from "@masc-landing/api/dashboard-tab-settings";
import { getRoundMemberships } from "@masc-landing/api/registration-memberships";
import type { RoundId } from "@masc-landing/api/rounds";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

import Dashboard, { type DashboardTab } from "./dashboard";

export default async function AuthenticatedDashboard({ activeTab }: { activeTab: DashboardTab }) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = { id: session.user.id, email: session.user.email };
  const [tabSettings, admissionSettings, memberships] = await Promise.all([
    getDashboardTabSettings(),
    getAdmissionSettings(),
    getRoundMemberships(user),
  ]);
  if (activeTab.startsWith("round-")) {
    const round = activeTab.slice(6) as RoundId;
    const isOpenDirectApplicationRoute = !memberships[round].registered &&
      directAdmissionRounds.some((admissionRound) => admissionRound === round) &&
      admissionSettings[round];
    if (!tabSettings[round] && !isOpenDirectApplicationRoute) {
      redirect("/dashboard");
    }
  }

  return <Dashboard session={session} activeTab={activeTab} tabSettings={tabSettings}
    initialMemberships={memberships} initialSettings={admissionSettings} />;
}
