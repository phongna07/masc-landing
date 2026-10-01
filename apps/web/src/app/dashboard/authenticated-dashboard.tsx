import { getAdmissionSettings } from "@masc-landing/api/admission-settings";
import { getDashboardTabSettings } from "@masc-landing/api/dashboard-tab-settings";
import { getRoundMemberships } from "@masc-landing/api/registration-memberships";
import { getRoundSubmissionStatuses } from "@masc-landing/api/routers/round-submission";
import { getRoundEndSettings } from "@masc-landing/api/round-end-settings";
import { getSubmissionSettings } from "@masc-landing/api/submission-settings";
import { getUploadLimits } from "@masc-landing/api/upload-limits";
import { getUserAnnouncements } from "@masc-landing/api/routers/user-announcements";
import { getRoundOnePreferenceSettings } from "@masc-landing/api/round-one-preferences";
import { getProblemStatementPublicationSettings } from "@masc-landing/api/problem-statement-publication-settings";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

import Dashboard, { type DashboardTab } from "./dashboard";

export default async function AuthenticatedDashboard({ activeTab }: { activeTab: DashboardTab }) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  const user = { id: session.user.id, email: session.user.email };
  const [admissionSettings, dashboardTabSettings, memberships, roundEndSettings, roundOnePreferenceSettings, submissionSettings, submissionStatuses, uploadLimits,
    userAnnouncements, problemStatementPublicationSettings] = await Promise.all([
    getAdmissionSettings(),
    getDashboardTabSettings(),
    getRoundMemberships(user),
    getRoundEndSettings(),
    getRoundOnePreferenceSettings(true),
    getSubmissionSettings(),
    getRoundSubmissionStatuses(user),
    getUploadLimits(),
    getUserAnnouncements(user.id),
    getProblemStatementPublicationSettings(),
  ]);

  return <Dashboard session={session} activeTab={activeTab}
    initialMemberships={memberships} initialSettings={admissionSettings}
    initialDashboardTabSettings={dashboardTabSettings}
    initialRoundEndSettings={roundEndSettings}
    initialRoundOnePreferenceSettings={roundOnePreferenceSettings}
    initialSubmissionSettings={submissionSettings}
    initialProblemStatementPublicationSettings={problemStatementPublicationSettings}
    initialSubmissionStatuses={submissionStatuses} initialUploadLimits={uploadLimits}
    initialUserAnnouncements={userAnnouncements} />;
}
