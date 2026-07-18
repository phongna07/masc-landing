import { requireAdmin } from "./admin-auth";
import AdminShell from "./admin-shell";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requireAdmin();

  return <AdminShell role={admin.role}>{children}</AdminShell>;
}
