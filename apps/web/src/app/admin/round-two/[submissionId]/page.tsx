import RoundTwoDetail from "./round-two-detail";

export default async function AdminRoundTwoDetailPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  return <RoundTwoDetail submissionId={submissionId} />;
}

