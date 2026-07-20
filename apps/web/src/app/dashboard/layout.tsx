import { isAdminEmail } from "@masc-landing/api/admin-access";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

export default async function DashboardLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await getServerSession();

	if (session?.user && (await isAdminEmail(session.user.email))) {
		redirect("/admin");
	}

	return children;
}
