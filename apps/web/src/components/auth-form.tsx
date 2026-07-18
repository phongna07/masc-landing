"use client";

import { useTranslations } from "next-intl";

import GoogleSignInButton from "./google-sign-in-button";

export default function AuthForm() {
  const t = useTranslations("Auth");

  return (
    <section className="auth-panel" aria-labelledby="auth-title">
      <div className="auth-panel-primary">
        <div className="auth-panel-heading">
          <span className="auth-eyebrow">{t("eyebrow")}</span>
          <h1 id="auth-title">{t("title")}</h1>
          <p>{t("description")}</p>
        </div>

        <div className="auth-social">
          <GoogleSignInButton />
          <p className="auth-signin-note">{t("secureSignIn")}</p>
        </div>
      </div>

      <aside className="auth-assurance" aria-labelledby="auth-assurance-title">
        <div className="auth-assurance-heading">
          <span className="auth-assurance-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3 5.5 5.8v5.5c0 4.2 2.7 7.9 6.5 9.2 3.8-1.3 6.5-5 6.5-9.2V5.8L12 3Z" />
              <path d="m9.2 11.8 1.8 1.8 3.9-4" />
            </svg>
          </span>
          <div>
            <span className="auth-eyebrow">{t("assurance.eyebrow")}</span>
            <h2 id="auth-assurance-title">{t("assurance.title")}</h2>
          </div>
        </div>

        <div className="auth-assurance-list">
          <div className="auth-assurance-item">
            <span aria-hidden="true">01</span>
            <div>
              <h3>{t("assurance.google.title")}</h3>
              <p>{t("assurance.google.description")}</p>
            </div>
          </div>
          <div className="auth-assurance-item">
            <span aria-hidden="true">02</span>
            <div>
              <h3>{t("assurance.data.title")}</h3>
              <p>{t("assurance.data.description")}</p>
            </div>
          </div>
          <div className="auth-assurance-item">
            <span aria-hidden="true">03</span>
            <div>
              <h3>{t("assurance.use.title")}</h3>
              <p>{t("assurance.use.description")}</p>
            </div>
          </div>
        </div>

        <p className="auth-disclaimer">{t("assurance.disclaimer")}</p>
      </aside>
    </section>
  );
}
