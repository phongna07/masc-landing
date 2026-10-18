import { requireAdminArea } from "../admin-auth";
import AdminManagement from "./admin-management";

export default async function ManageAdminsPage() {
	await requireAdminArea("manageAdmins");
	return <AdminManagement />;
}
