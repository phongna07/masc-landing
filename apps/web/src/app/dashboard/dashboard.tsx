"use client";

import type { AppRouter } from "@masc-landing/api/routers/index";
import { roundIds, type RoundId } from "@masc-landing/api/rounds";
import { TEAM_SIZE, TEAMMATE_COUNT } from "@masc-landing/api/registration";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { MegaphoneIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";
import { BrandLogo } from "@/components/hero-brand-logo";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";
import RoundSubmission from "./round-submission";

type Session = typeof authClient.$Infer.Session;
type Membership = inferRouterOutputs<AppRouter>["registration"]["current"];
type Teammate = { id: string; fullName: string; email: string; universityName: string };
type FormErrors = Record<string, string>;

const emptyTeammate = (id: string): Teammate => ({
  id,
  fullName: "",
  email: "",
  universityName: "",
});

export default function Dashboard({ session }: { session: Session }) {
  const t = useTranslations("Dashboard");
  const membership = useQuery(trpc.registration.current.queryOptions());

  return (
    <div className="dashboard-page">
      <header className="dashboard-navbar">
        <Link className="brand" href="/" aria-label={t("nav.homeLabel")}>
          <BrandLogo className="brand-logo" />
          <span className="brand-copy">
            Marketing All-Star Challenge
            <br />
            <small>HYPERNOVA</small>
          </span>
        </Link>
        <div className="dashboard-nav-actions">
          <LanguageSwitcher />
          <UserMenu />
        </div>
      </header>

      <main className="dashboard-main">
        {membership.data?.registered && (
          <div className="dashboard-heading">
            <p className="dashboard-eyebrow">{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p>{t("welcome", { name: session.user.name })}</p>
          </div>
        )}

        {membership.isPending ? (
          <DashboardSkeleton />
        ) : membership.isError ? (
          <Card className="dashboard-state-card">
            <CardHeader>
              <CardTitle>{t("errors.loadTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{t("errors.loadDescription")}</p>
              <Button onClick={() => membership.refetch()}>
                <RefreshCwIcon aria-hidden="true" /> {t("actions.retry")}
              </Button>
            </CardContent>
          </Card>
        ) : membership.data?.registered ? (
          <TeamDashboard membership={membership.data} />
        ) : (
          <RegistrationForm session={session} />
        )}
      </main>
    </div>
  );
}

const dashboardTabs = ["overview", "announcements", ...roundIds.map((round) => `round-${round}` as const)] as const;
type DashboardTab = "overview" | "announcements" | `round-${RoundId}`;

function TeamDashboard({ membership }: { membership: Extract<Membership, { registered: true }> }) {
  const t = useTranslations("Dashboard");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const selectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    requestAnimationFrame(() => document.getElementById(`dashboard-tab-${tab}`)?.focus());
  };
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % dashboardTabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + dashboardTabs.length) % dashboardTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = dashboardTabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(dashboardTabs[next]!);
  };

  return <div className="team-dashboard">
    <div className="dashboard-tabs" role="tablist" aria-label={t("tabs.label")}>
      {dashboardTabs.map((tab, index) => <button
        id={`dashboard-tab-${tab}`}
        key={tab}
        type="button"
        role="tab"
        aria-selected={activeTab === tab}
        aria-controls={`dashboard-panel-${tab}`}
        tabIndex={activeTab === tab ? 0 : -1}
        onClick={() => setActiveTab(tab)}
        onKeyDown={(event) => onTabKeyDown(event, index)}
      >{tab.startsWith("round-") ? t("tabs.round", { round: tab.slice(6) }) : t(`tabs.${tab}`)}</button>)}
    </div>
    <section id={`dashboard-panel-${activeTab}`} role="tabpanel" aria-labelledby={`dashboard-tab-${activeTab}`} tabIndex={0}>
      {activeTab === "overview" && <TeamOverview membership={membership} />}
      {activeTab === "announcements" && <Announcements />}
      {activeTab.startsWith("round-") && <RoundSubmission round={activeTab.slice(6) as RoundId} role={membership.role} />}
    </section>
  </div>;
}

function Announcements() {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  const announcements = useQuery(trpc.announcements.list.queryOptions());

  if (announcements.isPending) return <div className="announcement-feed"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (announcements.isError) return <StateCard title={t("announcements.errors.loadTitle")} description={t("announcements.errors.load")} retry={() => announcements.refetch()} />;
  if (announcements.data.length === 0) return <Card className="announcement-empty"><MegaphoneIcon aria-hidden="true" /><h2>{t("announcements.emptyTitle")}</h2><p>{t("announcements.emptyDescription")}</p></Card>;

  return <div className="announcement-feed">{announcements.data.map((announcement) => <Card className="announcement-post" key={announcement.id}>
    <CardHeader className="announcement-post-header"><div className="announcement-avatar"><BrandLogo /></div><div><CardTitle>{t("announcements.organizer")}</CardTitle><time dateTime={new Date(announcement.createdAt).toISOString()}>{format.dateTime(new Date(announcement.createdAt), { dateStyle: "medium", timeStyle: "short" })}</time></div></CardHeader>
    <CardContent><p className="announcement-content">{announcement.content}</p>{announcement.imageUrl && <img className="announcement-image" src={announcement.imageUrl} alt="" />}</CardContent>
  </Card>)}</div>;
}

function StateCard({ title, description, retry }: { title: string; description: string; retry: () => void }) {
  const t = useTranslations("Dashboard");
  return <Card className="dashboard-state-card"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{description}</p><Button onClick={retry}><RefreshCwIcon aria-hidden="true" />{t("actions.retry")}</Button></CardContent></Card>;
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function RegistrationForm({ session }: { session: Session }) {
  const t = useTranslations("Dashboard");
  const [teamName, setTeamName] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [captainUniversityName, setCaptainUniversityName] = useState("");
  const [teammates, setTeammates] = useState<Teammate[]>(
    Array.from({ length: TEAMMATE_COUNT }, (_, index) => emptyTeammate(`member-${index + 1}`)),
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const createTeam = useMutation(
    trpc.registration.createTeam.mutationOptions({
      onSuccess: async () => {
        toast.success(t("success.created"));
        await queryClient.invalidateQueries({ queryKey: trpc.registration.current.queryKey() });
      },
    }),
  );

  const updateTeammate = (id: string, field: keyof Omit<Teammate, "id">, value: string) => {
    setTeammates((current) =>
      current.map((member) => (member.id === id ? { ...member, [field]: value } : member)),
    );
  };

  const validate = () => {
    const next: FormErrors = {};
    const required = (key: string, value: string) => {
      if (!value.trim()) next[key] = t("validation.required");
    };

    required("teamName", teamName);
    required("captainPhone", captainPhone);
    required("captainUniversityName", captainUniversityName);
    const digits = captainPhone.replace(/\D/g, "");
    if (captainPhone && (!/^\+?[0-9\s()-]+$/.test(captainPhone) || digits.length < 8 || digits.length > 15)) {
      next.captainPhone = t("validation.phone");
    }

    const emails = [session.user.email.trim().toLowerCase()];
    teammates.forEach((member, index) => {
      const prefix = `teammates.${index}`;
      required(`${prefix}.fullName`, member.fullName);
      required(`${prefix}.email`, member.email);
      required(`${prefix}.universityName`, member.universityName);
      const email = member.email.trim().toLowerCase();
      if (member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        next[`${prefix}.email`] = t("validation.email");
      }
      emails.push(email);
    });

    if (emails.some((email, index) => email && emails.indexOf(email) !== index)) {
      next.form = t("validation.duplicateEmail");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createTeam.reset();
    if (!validate()) return;
    createTeam.mutate({
      teamName,
      captainPhone,
      captainUniversityName,
      teammates: teammates.map(({ id: _id, ...member }) => member),
    });
  };

  const mutationError = createTeam.error
    ? createTeam.error.data?.code === "CONFLICT"
      ? t("errors.conflict")
      : createTeam.error.message === "DUPLICATE_EMAILS"
        ? t("validation.duplicateEmail")
        : t("errors.create")
    : null;

  return (
    <form className="registration-form" onSubmit={submit} aria-label={t("registration.sectionLabel")} noValidate>
      <Card className="dashboard-card registration-intro">
        <CardHeader>
          <p className="dashboard-card-index">01 / {t("registration.section")}</p>
          <CardTitle>{t("registration.title")}</CardTitle>
          <p>{t("registration.description")}</p>
        </CardHeader>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <p className="dashboard-card-index">02 / {t("registration.teamSection")}</p>
          <CardTitle>{t("registration.teamDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="dashboard-fields">
          <Field label={t("fields.teamName")} error={errors.teamName}>
            <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} aria-invalid={!!errors.teamName} />
          </Field>
          <Field label={t("fields.captainPhone")} error={errors.captainPhone}>
            <Input type="tel" value={captainPhone} onChange={(event) => setCaptainPhone(event.target.value)} aria-invalid={!!errors.captainPhone} />
          </Field>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader>
          <p className="dashboard-card-index">03 / {t("registration.captainSection")}</p>
          <CardTitle>{t("registration.captainDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="dashboard-fields">
          <Field label={t("fields.fullName")}>
            <Input value={session.user.name} disabled />
          </Field>
          <Field label={t("fields.email")}>
            <Input type="email" value={session.user.email} disabled />
          </Field>
          <Field label={t("fields.university")} error={errors.captainUniversityName} full>
            <Input value={captainUniversityName} onChange={(event) => setCaptainUniversityName(event.target.value)} aria-invalid={!!errors.captainUniversityName} />
          </Field>
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader className="roster-form-header">
          <div>
            <p className="dashboard-card-index">04 / {t("registration.membersSection")}</p>
            <CardTitle>{t("registration.membersTitle")}</CardTitle>
            <p>{t("registration.memberCount", { count: TEAM_SIZE })}</p>
          </div>
        </CardHeader>
        <CardContent className="teammate-list">
          {teammates.map((member, index) => (
            <section className="teammate-card" key={member.id} aria-labelledby={`${member.id}-title`}>
              <div className="teammate-heading">
                <h3 id={`${member.id}-title`}>{t("registration.memberNumber", { number: index + 2 })}</h3>
              </div>
              <div className="dashboard-fields">
                <Field label={t("fields.fullName")} error={errors[`teammates.${index}.fullName`]}>
                  <Input value={member.fullName} onChange={(event) => updateTeammate(member.id, "fullName", event.target.value)} aria-invalid={!!errors[`teammates.${index}.fullName`]} />
                </Field>
                <Field label={t("fields.email")} error={errors[`teammates.${index}.email`]}>
                  <Input type="email" value={member.email} onChange={(event) => updateTeammate(member.id, "email", event.target.value)} aria-invalid={!!errors[`teammates.${index}.email`]} />
                </Field>
                <Field label={t("fields.university")} error={errors[`teammates.${index}.universityName`]} full>
                  <Input value={member.universityName} onChange={(event) => updateTeammate(member.id, "universityName", event.target.value)} aria-invalid={!!errors[`teammates.${index}.universityName`]} />
                </Field>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      {(errors.form || mutationError) && <p className="form-error" role="alert">{errors.form || mutationError}</p>}
      <div className="registration-submit">
        <p>{t("registration.submitNote")}</p>
        <Button type="submit" size="lg" disabled={createTeam.isPending}>
          {createTeam.isPending ? t("actions.submitting") : t("actions.submit")}
        </Button>
      </div>
    </form>
  );
}

function TeamOverview({ membership }: { membership: Extract<Membership, { registered: true }> }) {
  const t = useTranslations("Dashboard");
  const captain = membership.team.members.find((member) => member.isCaptain);
  return (
    <div className="team-overview">
      <Card className="dashboard-card team-hero-card">
        <CardHeader>
          <div className="team-badges">
            <span className="role-badge">{t(`roles.${membership.role}`)}</span>
            <span className={`status-badge status-${membership.team.status}`}>{t(`status.${membership.team.status}`)}</span>
          </div>
          <p className="dashboard-card-index">01 / {t("overview.registration")}</p>
          <CardTitle>{membership.team.name}</CardTitle>
          <p>{membership.role === "captain" ? t("overview.captainMessage") : t("overview.memberMessage")}</p>
        </CardHeader>
      </Card>
      <div className="overview-grid">
        <Card className="dashboard-card">
          <CardHeader><CardTitle>{t("overview.details")}</CardTitle></CardHeader>
          <CardContent className="detail-list">
            <Detail label={t("fields.teamName")} value={membership.team.name} />
            <Detail label={t("overview.statusLabel")} value={t(`status.${membership.team.status}`)} />
            <Detail label={t("overview.teamSize")} value={t("overview.people", { count: membership.team.members.length })} />
          </CardContent>
        </Card>
        <Card className="dashboard-card">
          <CardHeader><CardTitle>{t("overview.captainContact")}</CardTitle></CardHeader>
          <CardContent className="detail-list">
            <Detail label={t("fields.fullName")} value={captain?.fullName ?? "—"} />
            <Detail label={t("fields.email")} value={captain?.email ?? "—"} />
            <Detail label={t("fields.captainPhone")} value={membership.team.captainPhone} />
          </CardContent>
        </Card>
      </div>
      <Card className="dashboard-card roster-card">
        <CardHeader><CardTitle>{t("overview.roster")}</CardTitle></CardHeader>
        <CardContent className="roster-list">
          <table className="roster-table">
            <thead>
              <tr>
                <th scope="col" aria-label="Number">#</th>
                <th scope="col">{t("fields.fullName")}</th>
                <th scope="col">{t("fields.university")}</th>
                <th scope="col" aria-label={t("roles.captain")} />
              </tr>
            </thead>
            <tbody>
              {membership.team.members.map((member, index) => (
                <tr key={member.id}>
                  <td className="roster-index">{String(index + 1).padStart(2, "0")}</td>
                  <td><h3>{member.fullName}</h3><p>{member.email}</p></td>
                  <td><p>{member.universityName}</p></td>
                  <td>{member.isCaptain && <span className="captain-tag">{t("roles.captain")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, error, full = false, children }: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return <div className={`dashboard-field${full ? " field-full" : ""}`}><Label>{label}</Label>{children}{error && <span className="field-error">{error}</span>}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton"><Skeleton className="h-48 w-full" /><div><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div><Skeleton className="h-64 w-full" /></div>;
}
