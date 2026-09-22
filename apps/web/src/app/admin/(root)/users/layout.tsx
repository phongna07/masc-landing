import { requireAdminArea } from "../../admin-auth";

export default async function UsersAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("users");

  return children;
}
