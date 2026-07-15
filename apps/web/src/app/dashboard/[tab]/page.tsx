import { roundFromSlug } from "@masc-landing/api/rounds";
import { notFound } from "next/navigation";

import AuthenticatedDashboard from "../authenticated-dashboard";

export default async function DashboardTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;

  if (tab === "announcements") {
    return <AuthenticatedDashboard activeTab="announcements" />;
  }

  const round = roundFromSlug(tab);
  if (!round) {
    notFound();
  }

  return <AuthenticatedDashboard activeTab={`round-${round}`} />;
}
