import { notFound } from "next/navigation";
import { roundFromSlug } from "@masc-landing/api/rounds";
import RoundSubmissionDetail from "./round-submission-detail";

export default async function Page({ params }: { params: Promise<{ roundSlug: string; submissionId: string }> }) {
  const { roundSlug, submissionId } = await params; const round = roundFromSlug(roundSlug); if (!round) notFound();
  return <RoundSubmissionDetail round={round} submissionId={submissionId} />;
}
