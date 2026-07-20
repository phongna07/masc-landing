import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

import LoginPageClient from "./login-page-client";

export default async function LoginPage() {
  const session = await getServerSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LoginPageClient />;
}
