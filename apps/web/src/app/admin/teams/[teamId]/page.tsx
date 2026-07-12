import TeamDetail from "./team-detail";

export default async function AdminTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <TeamDetail teamId={teamId} />;
}
