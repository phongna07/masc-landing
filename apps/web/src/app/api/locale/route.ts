import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { isLocale, localeCookieName } from "@/i18n/config";

const oneYearInSeconds = 60 * 60 * 24 * 365;

export async function GET(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;
  const requestedReturnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  const returnTo =
    requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/";

  if (typeof locale !== "string" || !isLocale(locale)) {
    return NextResponse.redirect(new URL(returnTo, request.url));
  }

  const cookieStore = await cookies();
  cookieStore.set(localeCookieName, locale, {
    httpOnly: true,
    maxAge: oneYearInSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.redirect(new URL(returnTo, request.url));
}
