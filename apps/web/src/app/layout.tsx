import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import NextTopLoader from "nextjs-toploader";
import { Analytics } from "@vercel/analytics/next";

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
  const [locale, t] = await Promise.all([
    getLocale(),
    getTranslations("Metadata"),
  ]);
  const title = t("title");
  const description = t("description");

  return {
    metadataBase: new URL("https://marketingallstarchallenge.com"),
    title,
    description,
    icons: {
      icon: logo.src,
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Marketing All-Star Challenge",
      locale: locale === "vi" ? "vi_VN" : "en_US",
      title,
      description,
      images: [
        {
          url: "/preview.png",
          width: 1077,
          height: 722,
          alt: title,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/preview.png"],
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
        <Analytics />
      </body>
    </html>
  );
}
