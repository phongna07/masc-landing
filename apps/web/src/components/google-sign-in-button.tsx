"use client";

import { Button } from "@masc-landing/ui/components/button";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import CompetitionRulebook from "./competition-rulebook";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" className="google-sign-in-logo" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.35 12.27c0-.76-.07-1.49-.2-2.19H12v4.14h5.23a4.47 4.47 0 0 1-1.94 2.93v2.68h3.45c2.02-1.86 3.2-4.6 3.2-7.56Z" />
      <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.36l-3.45-2.68c-.96.64-2.18 1.02-3.7 1.02-2.84 0-5.25-1.92-6.11-4.5H1.6v2.76A9.71 9.71 0 0 0 12 21.75Z" />
      <path fill="#FBBC05" d="M5.89 13.23a5.84 5.84 0 0 1 0-3.73V6.74H1.6a9.71 9.71 0 0 0 0 9.25l4.29-2.76Z" />
      <path fill="#EA4335" d="M12 5.01c1.62 0 3.07.56 4.21 1.65l3.16-3.16C16.81 1.11 14.62.25 12 .25A9.71 9.71 0 0 0 1.6 6.74L5.89 9.5C6.75 6.92 9.16 5.01 12 5.01Z" />
    </svg>
  );
}

export default function GoogleSignInButton() {
  const t = useTranslations("Auth");
  const [isPending, setIsPending] = useState(false);
  const [isRulebookOpen, setIsRulebookOpen] = useState(false);
  const [hasReadRulebook, setHasReadRulebook] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rulebookViewportRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isRulebookOpen && !dialog.open) {
      dialog.showModal();
      const viewport = rulebookViewportRef.current;
      if (viewport) {
        viewport.scrollTop = 0;
        if (viewport.scrollHeight - viewport.clientHeight <= 2) {
          setHasReadRulebook(true);
        }
      }
    } else if (!isRulebookOpen && dialog.open) {
      dialog.close();
    }
  }, [isRulebookOpen]);

  useEffect(() => {
    const handleGoogleAuthComplete = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "google-auth-complete") {
        return;
      }

      setIsPending(false);
      popupRef.current = null;

      if (event.data.success) {
        window.location.assign("/dashboard");
      } else {
        toast.error(event.data.error || "Google sign-in was cancelled.");
      }
    };

    window.addEventListener("message", handleGoogleAuthComplete);
    return () => window.removeEventListener("message", handleGoogleAuthComplete);
  }, []);

  useEffect(() => {
    if (!isPending || !popupRef.current) {
      return;
    }

    const interval = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null;
        setIsPending(false);
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [isPending]);

  const signInWithGoogle = async () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "",
      "google-sign-in",
      `popup,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
    );

    if (!popup) {
      toast.error("Please allow popups to continue with Google.");
      return;
    }

    popupRef.current = popup;
    setIsPending(true);

    const { data, error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/login/google-callback",
      errorCallbackURL: "/login/google-callback?error=1",
      disableRedirect: true,
    });

    if (error || !data?.url) {
      popup.close();
      popupRef.current = null;
      setIsPending(false);
      toast.error(error?.message || error?.statusText || "Unable to start Google sign-in.");
      return;
    }

    popup.location.href = data.url;
  };

  const discardRulebook = () => {
    setIsRulebookOpen(false);
  };

  const acceptRulebook = () => {
    if (!hasReadRulebook) {
      return;
    }

    setIsRulebookOpen(false);
    void signInWithGoogle();
  };

  const handleRulebookScroll = () => {
    const viewport = rulebookViewportRef.current;
    if (
      viewport &&
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2
    ) {
      setHasReadRulebook(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="google-sign-in-button"
        onClick={() => setIsRulebookOpen(true)}
        disabled={isPending}
      >
        <GoogleLogo />
        <span>{t("google.button")}</span>
      </Button>

      <dialog
        ref={dialogRef}
        className="rulebook-dialog"
        aria-labelledby="rulebook-dialog-title"
        aria-describedby="rulebook-dialog-instruction"
        onClose={() => setIsRulebookOpen(false)}
      >
        <div className="rulebook-dialog-content">
          <header className="rulebook-dialog-header">
            <span className="auth-eyebrow">MASC '26</span>
            <h2 id="rulebook-dialog-title">{t("rulebookTitle")}</h2>
          </header>

          <div
            ref={rulebookViewportRef}
            className="rulebook-dialog-viewport"
            tabIndex={0}
            onScroll={handleRulebookScroll}
          >
            <CompetitionRulebook />
          </div>

          <footer className="rulebook-dialog-footer">
            <p aria-live="polite" className="rulebook-dialog-warning">
              {!hasReadRulebook ? t("google.rulebook.instruction") : null}
            </p>
            <div className="rulebook-dialog-actions">
              <Button type="button" variant="outline" onClick={discardRulebook}>
                {t("google.rulebook.discard")}
              </Button>
              <Button type="button" disabled={!hasReadRulebook} onClick={acceptRulebook}>
                {t("google.rulebook.accept")}
              </Button>
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}
