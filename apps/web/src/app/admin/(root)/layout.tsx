import { requireAdminArea } from "../admin-auth";

export default async function RootAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("overview");

  return children;
}
