import { isAdminEmail } from "@masc-landing/api/admin-access";
import { auth } from "@masc-landing/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (session?.user && (await isAdminEmail(session.user.email))) {
		redirect("/admin");
	}

	return children;
}
