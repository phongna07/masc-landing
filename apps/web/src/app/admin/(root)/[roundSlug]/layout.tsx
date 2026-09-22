import { requireAdminArea } from "../../admin-auth";

export default async function RoundAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminArea("rounds");

  return children;
}
