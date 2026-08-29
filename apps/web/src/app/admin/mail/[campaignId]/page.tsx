import CampaignDetail from "./campaign-detail";

export default async function AdminMailCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
	const { campaignId } = await params;
	return <CampaignDetail campaignId={campaignId} />;
}
