import { roundFromSlug } from "@masc-landing/api/rounds";
import { notFound, permanentRedirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ roundSlug: string; submissionId: string }> }) {
	const { roundSlug, submissionId } = await params;
	if (!roundFromSlug(roundSlug)) notFound();
	permanentRedirect(`/admin/submissions/${roundSlug}/${submissionId}`);
}
