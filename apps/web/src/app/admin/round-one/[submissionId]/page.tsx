import RoundOneDetail from "./round-one-detail";

export default async function AdminRoundOneDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return <RoundOneDetail submissionId={submissionId} />;
}
