"use client";

import { useTranslations } from "next-intl";

import GoogleSignInButton from "./google-sign-in-button";

export default function AuthForm() {
  const t = useTranslations("Auth");

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-panel-heading">
        <h1 id="auth-title">{t("title")}</h1>
        <p>{t("description")}</p>
      </div>

      <div className="auth-social">
        <GoogleSignInButton />
      </div>
    </section>
  );
}
