"use client";

import Image from "next/image";

import loginBackground from "@/assets/image-3.png";
import AuthForm from "@/components/auth-form";
import SiteHeader from "@/components/site-header";

export default function LoginPageClient() {
  return (
    <main className="auth-page">
      <div className="auth-background" aria-hidden="true">
        <Image
          src={loginBackground}
          alt=""
          fill
          priority
          sizes="100vw"
          placeholder="blur"
        />
      </div>

      <SiteHeader />

      <section className="auth-layout" aria-label="MASC account portal">
        <AuthForm />
      </section>
    </main>
  );
}
