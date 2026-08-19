import { requireAdminArea } from "../admin-auth";

export default async function TeamsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	await requireAdminArea("teams");
	return children;
}
