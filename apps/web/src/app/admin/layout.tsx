import { auth } from "@masc-landing/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AdminShell from "./admin-shell";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}
