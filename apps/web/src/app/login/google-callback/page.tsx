"use client";

import { useEffect } from "react";

export default function GoogleCallbackPage() {
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");

    window.opener?.postMessage(
      {
        type: "google-auth-complete",
        success: !error,
        error: error || undefined,
      },
      window.location.origin,
    );

    window.close();
  }, []);

  return <p>Completing Google sign-in…</p>;
}
