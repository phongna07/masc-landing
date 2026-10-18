import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";
import { loginDestination } from "@/lib/login-destination";

import LoginPageClient from "./login-page-client";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = loginDestination((await searchParams).next);
  const session = await getServerSession();

  if (session?.user) {
    redirect(next);
  }

  return <LoginPageClient next={next} />;
}
