import { getAdmissionSettings } from "@masc-landing/api/admission-settings";
import { getRoundMemberships } from "@masc-landing/api/registration-memberships";
import { getRoundSubmissionStatuses } from "@masc-landing/api/routers/round-submission";
import { getUserAnnouncements } from "@masc-landing/api/routers/user-announcements";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

import Dashboard, { type DashboardTab } from "./dashboard";

export default async function AuthenticatedDashboard({ activeTab }: { activeTab: DashboardTab }) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = { id: session.user.id, email: session.user.email };
  const [admissionSettings, memberships, submissionStatuses, userAnnouncements] = await Promise.all([
    getAdmissionSettings(),
    getRoundMemberships(user),
    getRoundSubmissionStatuses(user),
    getUserAnnouncements(user.id),
  ]);

  return <Dashboard session={session} activeTab={activeTab}
    initialMemberships={memberships} initialSettings={admissionSettings}
    initialSubmissionStatuses={submissionStatuses} initialUserAnnouncements={userAnnouncements} />;
}
