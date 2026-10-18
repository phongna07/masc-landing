import { redirect } from "next/navigation";
import { getFreshServerSession } from "./server-session";

export async function requireTicketBuyer(destination: string) {
	const session = await getFreshServerSession();
	if (!session?.user) redirect(`/login?next=${encodeURIComponent(destination)}`);
	return session;
}
