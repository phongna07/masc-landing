import { notFound } from "next/navigation";
import { z } from "zod";
import GiftBatchDetail from "./batch-detail";
export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!z.uuid().safeParse(id).success) notFound();
	return <GiftBatchDetail id={id} />;
}
