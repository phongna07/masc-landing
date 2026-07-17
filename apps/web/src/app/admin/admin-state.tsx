import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { RefreshCwIcon } from "lucide-react";

export function AdminHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="admin-heading"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>;
}

export function AdminLoading() {
  return <div className="admin-loading" aria-label="Loading"><Skeleton className="h-12 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
}

export function AdminError({ title, description, retry, retryLabel = "Retry" }: { title: string; description: string; retry: () => void; retryLabel?: string }) {
  return <Card className="dashboard-state-card"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{description}</p><Button onClick={retry}><RefreshCwIcon aria-hidden="true" />{retryLabel}</Button></CardContent></Card>;
}

export function AdminEmpty({ title, description }: { title: string; description: string }) {
  return <Card className="admin-empty"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{description}</p></CardContent></Card>;
}

export function formatDate(value: string | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatBirthdate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}
