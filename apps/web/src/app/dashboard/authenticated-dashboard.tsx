import { getAdmissionSettings } from "@masc-landing/api/admission-settings";
import { getRoundMemberships } from "@masc-landing/api/registration-memberships";
import { getRoundSubmissionStatuses } from "@masc-landing/api/routers/round-submission";
import { getSubmissionSettings } from "@masc-landing/api/submission-settings";
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
  const [admissionSettings, memberships, submissionSettings, submissionStatuses, userAnnouncements] = await Promise.all([
    getAdmissionSettings(),
    getRoundMemberships(user),
    getSubmissionSettings(),
    getRoundSubmissionStatuses(user),
    getUserAnnouncements(user.id),
  ]);

  return <Dashboard session={session} activeTab={activeTab}
    initialMemberships={memberships} initialSettings={admissionSettings}
    initialSubmissionSettings={submissionSettings}
    initialSubmissionStatuses={submissionStatuses} initialUserAnnouncements={userAnnouncements} />;
}
