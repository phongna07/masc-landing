import { Button } from "@masc-landing/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@masc-landing/ui/components/dropdown-menu";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";

function proxiedAvatarUrl(image: string) {
  return `https://wsrv.nl/?url=${encodeURIComponent(image)}&w=64&h=64&fit=cover`;
}

export default function UserMenu() {
  const t = useTranslations("UserMenu");
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="outline">{t("signIn")}</Button>
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="aria-expanded:!border-white/30 aria-expanded:!bg-white/[0.08] aria-expanded:!text-foreground"
          />
        }
      >
        {session.user.image ? (
          <img
            className="user-menu-avatar"
            src={proxiedAvatarUrl(session.user.image)}
            alt=""
            width={28}
            height={28}
          />
        ) : (
          <span className="user-menu-avatar user-menu-avatar-fallback" aria-hidden="true">
            {session.user.name.slice(0, 1)}
          </span>
        )}
        {session.user.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("account")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <p className="px-2 py-2 text-xs">{session.user.email}</p>
          <DropdownMenuItem render={<Link href="/dashboard" />}>
            {t("profile")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.assign("/");
                  },
                },
              });
            }}
          >
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
