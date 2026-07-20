"use client";

import Link from "next/link";

import { authClient } from "@/lib/auth-client";

type SessionAwareLinkProps = {
  className: string;
  signedInLabel: string;
  signedOutLabel: string;
};

export default function SessionAwareLink({
  className,
  signedInLabel,
  signedOutLabel,
}: SessionAwareLinkProps) {
  const { data: session } = authClient.useSession();
  const isSignedIn = Boolean(session?.user);

  return (
    <Link className={className} href={isSignedIn ? "/dashboard" : "/login"}>
      <span>{isSignedIn ? signedInLabel : signedOutLabel}</span>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}
