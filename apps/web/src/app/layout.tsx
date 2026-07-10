import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "../index.css";
import Providers from "@/components/providers";

const castela = localFont({
  src: "../assets/BHNCastelaMolgateRegular.woff2",
  variable: "--font-castela",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "MASC 2026 — SUPERNOVA",
  description:
    "Marketing All-Star Challenge 2026: SUPERNOVA — Vietnam's arena for the next generation of marketing talent.",
};

export const viewport: Viewport = {
  themeColor: "#07070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={castela.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
