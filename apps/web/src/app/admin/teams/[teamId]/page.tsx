import { redirect } from "next/navigation";

export default async function LegacyTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  redirect(`/admin/teams/round-0.5/${teamId}`);
}
