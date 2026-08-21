import { requireAdminArea } from "../admin-auth";

export default async function CvScreeningLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	await requireAdminArea("roundOneCvScreening");
	return children;
}
