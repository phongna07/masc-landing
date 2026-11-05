import { requireAdminArea } from "../admin-auth";
import EntranceInfo from "./entrance-info";
import "@/components/tickets/tickets.css";

export default async function EntranceInfoPage() {
	await requireAdminArea("entranceInfo");
	return <div className="ticket-admin"><EntranceInfo /></div>;
}
