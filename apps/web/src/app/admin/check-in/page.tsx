import { requireAdminArea } from "../admin-auth";
import CheckInScanner from "./check-in-scanner";
import "@/components/tickets/tickets.css";

export default async function CheckInPage() {
	const admin = await requireAdminArea("checkIn");
	return <div className="ticket-admin"><CheckInScanner isRoot={admin.role === "root"} /></div>;
}
