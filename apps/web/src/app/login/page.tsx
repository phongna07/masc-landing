import { auth } from "@masc-landing/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import LoginPageClient from "./login-page-client";

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect("/dashboard");
  }

  return <LoginPageClient />;
}
