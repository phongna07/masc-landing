import RoundThreeDetail from "./round-three-detail";

export default async function AdminRoundThreeDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return <RoundThreeDetail submissionId={submissionId} />;
}

