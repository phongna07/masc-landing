import { requireAdminArea } from "../admin-auth";

export default async function MailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	await requireAdminArea("mail");
	return children;
}
