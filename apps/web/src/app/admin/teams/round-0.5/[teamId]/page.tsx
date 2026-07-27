import RoundTeamDetail from "../../round-team-detail";

export default async function Page({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  return <RoundTeamDetail round="0.5" teamId={teamId} />;
}
