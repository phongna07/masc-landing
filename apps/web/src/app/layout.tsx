import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import NextTopLoader from "nextjs-toploader";

import "../index.css";
import logo from "../assets/logo.png";
import Providers from "@/components/providers";

const castela = localFont({
  src: "../assets/BHNCastelaMolgateRegular.woff2",
  variable: "--font-castela",
  display: "swap",
  weight: "400",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");

  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: logo.src,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#07070a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <body className={castela.variable}>
        <NextTopLoader color="linear-gradient(90deg, var(--violet), #f5d078, var(--ember))" height={2} showSpinner={false}></NextTopLoader>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
