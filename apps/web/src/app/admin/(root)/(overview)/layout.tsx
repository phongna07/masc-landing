import { requireAdminArea } from "../../admin-auth";

export default async function OverviewAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("overview");

  return children;
}
