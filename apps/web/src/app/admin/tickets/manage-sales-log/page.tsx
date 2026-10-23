import { requireAdminArea } from "../../admin-auth";
import SalesLogs from "@/components/tickets/sales-logs";

export default async function ManageSalesLogPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
	await requireAdminArea("tickets");
	const { id } = await searchParams;
	return <SalesLogs manage isRoot initialId={id} />;
}
