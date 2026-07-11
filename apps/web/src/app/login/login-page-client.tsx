"use client";

import Image from "next/image";
import { useState } from "react";

import loginBackground from "@/assets/login-background.png";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import SiteHeader from "@/components/site-header";

export default function LoginPageClient() {
  const [showSignIn, setShowSignIn] = useState(false);

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
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </section>
    </main>
  );
}
