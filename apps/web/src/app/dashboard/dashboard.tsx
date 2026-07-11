"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export default function Dashboard({ session }: { session: typeof authClient.$Infer.Session }) {
  const t = useTranslations("Dashboard");
  const privateData = useQuery(trpc.privateData.queryOptions());

  return (
    <>
      <p>{t("api", { message: privateData.data?.message ?? "" })}</p>
    </>
  );
}
