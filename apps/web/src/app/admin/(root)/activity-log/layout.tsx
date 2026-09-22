import { requireAdminArea } from "../../admin-auth";

export default async function ActivityLogAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("activityLogs");

  return children;
}
