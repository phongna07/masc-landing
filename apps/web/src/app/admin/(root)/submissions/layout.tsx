import { requireAdminArea } from "@/app/admin/admin-auth";

export default async function SubmissionsAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("rounds");

  return children;
}
