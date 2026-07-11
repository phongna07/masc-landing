import { auth } from "@masc-landing/auth";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import Dashboard from "./dashboard";

export default async function DashboardPage() {
  const t = await getTranslations("Dashboard");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div>
      <h1>{t("title")}</h1>
      <p>{t("welcome", { name: session.user.name })}</p>
      <Dashboard session={session} />
    </div>
  );
}
