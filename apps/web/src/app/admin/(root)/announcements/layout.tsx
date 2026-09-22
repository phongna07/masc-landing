import { requireAdminArea } from "../../admin-auth";

export default async function AnnouncementsAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("announcements");

  return children;
}
