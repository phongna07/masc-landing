"use client";

import Link from "next/link";
import type { Route } from "next";

import { authClient } from "@/lib/auth-client";

type SessionAwareLinkProps = {
  className: string;
  signedInLabel: string;
  signedOutLabel: string;
  destination?: Route;
};

export default function SessionAwareLink({
  className,
  signedInLabel,
  signedOutLabel,
  destination,
}: SessionAwareLinkProps) {
  const { data: session } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);

  return (
    <Link className={className} href={(destination ? (isSignedIn ? destination : `/login?next=${encodeURIComponent(destination)}`) : (isSignedIn ? "/dashboard" : "/login")) as Route}>
      <span>{isSignedIn ? signedInLabel : signedOutLabel}</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
