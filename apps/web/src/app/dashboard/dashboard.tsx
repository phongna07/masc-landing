"use client";

import type { AppRouter } from "@masc-landing/api/routers/index";
import { roundIds, type RoundId } from "@masc-landing/api/rounds";
import { getEligibleBirthdateRange, isEligibleBirthdate, TEAMMATE_COUNT } from "@masc-landing/api/registration";
import {
  awarenessSources,
  awarenessSourcesRequiringDetail,
  type AwarenessSource,
  containsEmoji,
} from "@masc-landing/api/registration-schema";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@masc-landing/ui/components/accordion";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowDownIcon, ArrowRightIcon, CheckCircle2Icon, ChevronDownIcon, ListChecksIcon, MegaphoneIcon, MessageSquareQuoteIcon,
  RefreshCwIcon, TriangleAlertIcon
} from "lucide-react";
import type { Route } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";
import { BrandLogo } from "@/components/hero-brand-logo";
import { useRoundLabel } from "@/hooks/use-round-label";
import { authClient } from "@/lib/auth-client";
import { queryClient, trpc } from "@/utils/trpc";
import AnnouncementsSkeleton from "./announcements-skeleton";
import PromotionAnnouncements from "./promotion-announcements";
import RoundSubmission from "./round-submission";

type Session = typeof authClient.$Infer.Session;
type Membership = inferRouterOutputs<AppRouter>["registration"]["current"];
type RoundOneMembership = Extract<Membership, { registered: true; round: "1" }>;
type Memberships = inferRouterOutputs<AppRouter>["registration"]["memberships"];
type SubmissionStatuses = inferRouterOutputs<AppRouter>["roundSubmission"]["statuses"];
type UploadLimits = inferRouterOutputs<AppRouter>["uploadLimits"];
type RoundOnePreferenceSettings = inferRouterOutputs<AppRouter>["registration"]["roundOnePreferenceSettings"];
type UserAnnouncements = inferRouterOutputs<AppRouter>["userAnnouncements"]["listMine"];
type Teammate = { id: string; fullName: string; email: string; birthdate: string; universityName: string };
type FormErrors = Record<string, string>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gmailDomain = "@gmail.com";
const emptyTeammate = (id: string): Teammate => ({
  id,
  fullName: "",
  email: "",
  birthdate: "",
  universityName: "",
});

export type DashboardTab = "overview" | `round-${RoundId}`;

const AnnouncementsFeed = dynamic(() => import("./announcements-feed"), {
  loading: () => <AnnouncementsSkeleton />,
});

export default function Dashboard({ session, activeTab, initialMemberships, initialSettings, initialDashboardTabSettings, initialSubmissionSettings,
  initialRoundOnePreferenceSettings, initialSubmissionStatuses, initialUploadLimits, initialUserAnnouncements }: {
    session: Session;
    activeTab: DashboardTab;
    initialMemberships: Memberships;
    initialSettings: Record<RoundId, boolean>;
    initialDashboardTabSettings: Record<RoundId, boolean>;
    initialRoundOnePreferenceSettings: RoundOnePreferenceSettings;
    initialSubmissionSettings: Record<RoundId, boolean>;
    initialSubmissionStatuses: SubmissionStatuses;
    initialUploadLimits: UploadLimits;
    initialUserAnnouncements: UserAnnouncements;
  }) {
  const t = useTranslations("Dashboard");
  const roundLabel = useRoundLabel();
  const memberships = useQuery({ ...trpc.registration.memberships.queryOptions(), initialData: initialMemberships });
  const settings = useQuery({ ...trpc.registration.settings.queryOptions(), initialData: initialSettings });
  const submissionStatuses = useQuery({
    ...trpc.roundSubmission.statuses.queryOptions(),
    initialData: initialSubmissionStatuses,
  });
  const roundOnePreferenceSettings = useQuery({
    ...trpc.registration.roundOnePreferenceSettings.queryOptions(),
    initialData: initialRoundOnePreferenceSettings,
  });
  const uploadLimits = useQuery({ ...trpc.uploadLimits.queryOptions(), initialData: initialUploadLimits });

  return (
    <div className="dashboard-page">
      <header className="dashboard-navbar">
        <Link className="brand" href="/" aria-label={t("nav.homeLabel")}>
          <BrandLogo className="brand-logo" />
          <span className="brand-copy">
            Marketing All-Star Challenge 2026
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
        <div className="dashboard-heading-row">
          <div className="dashboard-heading">
            <p className="dashboard-eyebrow">{t("eyebrow")}</p>
            <h1>{activeTab.startsWith("round-") ? t("hub.roundTitle", { roundLabel: roundLabel(activeTab.slice(6) as RoundId) }) : t("title")}</h1>
            <p>{t("welcome", { name: session.user.name })}</p>
          </div>
          {activeTab === "overview" && <Button className="dashboard-announcement-jump" variant="outline"
            nativeButton={false} render={<a href="#dashboard-announcements" />}>
            <MegaphoneIcon aria-hidden="true" />
            {t("actions.announcement")}
            <ArrowDownIcon aria-hidden="true" />
          </Button>}
        </div>

        {activeTab === "overview" && <PromotionAnnouncements initialAnnouncements={initialUserAnnouncements} />}

        {memberships.isPending || settings.isPending || uploadLimits.isPending || roundOnePreferenceSettings.isPending ? (
          <DashboardSkeleton />
        ) : memberships.isError || settings.isError || uploadLimits.isError || roundOnePreferenceSettings.isError ? (
          <Card className="dashboard-state-card">
            <CardHeader>
              <CardTitle>{t("errors.loadTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{t("errors.loadDescription")}</p>
              <Button onClick={() => { memberships.refetch(); settings.refetch(); uploadLimits.refetch(); roundOnePreferenceSettings.refetch(); }}>
                <RefreshCwIcon aria-hidden="true" /> {t("actions.retry")}
              </Button>
            </CardContent>
          </Card>
        ) : activeTab === "overview" ? <RoundHub memberships={memberships.data!} settings={settings.data!}
          dashboardTabSettings={initialDashboardTabSettings}
          submissionSettings={initialSubmissionSettings}
          submissionStatuses={submissionStatuses.data ?? initialSubmissionStatuses} />
          : <RoundDashboard round={activeTab.slice(6) as RoundId} session={session} settings={settings.data!}
            uploadLimits={uploadLimits.data!} preferenceSettings={roundOnePreferenceSettings.data!} />}
      </main>
    </div>
  );
}

function RoundHub({ memberships, settings, dashboardTabSettings, submissionSettings, submissionStatuses }: {
  memberships: Memberships;
  settings: Record<RoundId, boolean>;
  dashboardTabSettings: Record<RoundId, boolean>;
  submissionSettings: Record<RoundId, boolean>;
  submissionStatuses: SubmissionStatuses;
}) {
  const t = useTranslations("Dashboard");
  const roundLabel = useRoundLabel();

  return <div className="round-hub">
    <div className="round-entry-grid">{roundIds.filter((round) => dashboardTabSettings[round]).map((round) => {
      const membership = memberships[round];
      const submissionStatus = submissionStatuses[round];
      const isDirectAdmissionRound = round === "0.5" || round === "1";
      const canApply = !membership.registered && isDirectAdmissionRound && settings[round];
      const roundKey = round.replace(".", "_");
      const description = canApply && round === "1" && memberships["0.5"].registered
        ? t("hub.roundOneAlternative") : t(`hub.description.${roundKey}`);
      const state = membership.registered ? membership.team.status : canApply ? "open"
        : isDirectAdmissionRound ? "closed" : "locked";
      const isSubmissionOngoing = membership.registered && membership.team.status === "approved"
        && submissionSettings[round];
      const needsRoundOnePreferences = round === "1" && membership.registered
        && membership.team.admissionMethod === "round_0_5_promotion"
        && "preferenceStatus" in membership.team
        && membership.team.preferenceStatus === "not_submitted";
      const stateLabel = isSubmissionOngoing ? t("hub.ongoing")
        : membership.registered ? t(`status.${membership.team.status}`) : canApply ? t("hub.open")
          : isDirectAdmissionRound ? t("hub.closed") : t("hub.notEligible");
      return <Card className={`dashboard-card round-entry-card round-entry-card-${state}`} key={round}>
        {needsRoundOnePreferences && <div className="round-entry-submission-status round-entry-submission-status-feedback">
          <ListChecksIcon aria-hidden="true" />
          <p>{t("hub.preferenceReminder")}</p>
        </div>}
        {membership.registered && submissionStatus && <div
          className={`round-entry-submission-status round-entry-submission-status-${submissionStatus}`}>
          {submissionStatus === "feedback" ? <MessageSquareQuoteIcon aria-hidden="true" />
            : <CheckCircle2Icon aria-hidden="true" />}
          <p>{t(`hub.submissionStatus.${submissionStatus}`)}</p>
        </div>}
        <CardHeader>
          <div className="round-entry-topline"><p className="dashboard-card-index">{t(`hub.names.${roundKey}`)}</p>
            <span className={`status-badge status-${state}`}>{stateLabel}</span></div>
          <CardTitle className="uppercase">{t("tabs.round", { roundLabel: roundLabel(round) })}</CardTitle>
          {!membership.registered && <p>{description}</p>}
        </CardHeader>
        <CardContent>
          {membership.registered ? <>
            <div className="round-entry-registration">
              <div className="round-entry-team">
                <span>{t("hub.registeredTeam")}</span><strong>{membership.team.name}</strong>
              </div>
              <Button nativeButton={false} render={<Link href={`/dashboard/round-${round}` as Route} />}>
                {t("hub.go", { roundLabel: roundLabel(round) })}<ArrowRightIcon aria-hidden="true" /></Button>
            </div>
          </> : <>
            {!canApply && <p className="round-entry-unavailable">
              {isDirectAdmissionRound ? t("hub.closedDescription") : t("hub.eligibilityDescription", { roundLabel: roundLabel(round) })}</p>}
            {canApply && <Button nativeButton={false} render={<Link href={`/dashboard/round-${round}` as Route} />}>
              {t("hub.apply", { roundLabel: roundLabel(round) })}<ArrowRightIcon aria-hidden="true" /></Button>}
          </>}
        </CardContent>
      </Card>;
    })}</div>
    <section id="dashboard-announcements" className="announcement-section" aria-labelledby="dashboard-announcements-title">
      <div className="announcement-section-heading">
        <div><p className="dashboard-card-index">{t("tabs.announcements")}</p>
          <h2 id="dashboard-announcements-title">{t("hub.announcementsTitle")}</h2>
          <p>{t("hub.announcementsDescription")}</p></div>
      </div>
      <AnnouncementsFeed />
    </section>
  </div>;
}

function RoundDashboard({ round, session, settings, uploadLimits, preferenceSettings }: {
  round: RoundId;
  session: Session;
  settings: Record<RoundId, boolean>;
  uploadLimits: UploadLimits;
  preferenceSettings: RoundOnePreferenceSettings;
}) {
  const t = useTranslations("Dashboard");
  const roundLabel = useRoundLabel();
  const membership = useQuery(trpc.registration.current.queryOptions({ round }));
  if (membership.isPending) return <DashboardSkeleton />;
  if (membership.isError) return <StateCard title={t("errors.loadTitle")} description={t("errors.loadDescription")} retry={() => membership.refetch()} />;
  return <div className="team-dashboard"><Link className="admin-back-link" href="/dashboard">← {t("hub.back")}</Link>
    {!membership.data.registered ? (round === "0.5" || round === "1")
      ? settings[round] ? <RegistrationForm session={session} round={round} maxCvFileSize={uploadLimits.participantCv}
          preferenceSettings={preferenceSettings} />
        : <Card className="dashboard-state-card"><CardHeader><CardTitle>{t("hub.closed")}</CardTitle></CardHeader><CardContent><p>{t("hub.closedDescription")}</p></CardContent></Card>
      : <Card className="dashboard-state-card"><CardHeader><CardTitle>{t("hub.notEligible")}</CardTitle></CardHeader><CardContent><p>{t("hub.eligibilityDescription", { roundLabel: roundLabel(round) })}</p></CardContent></Card>
      : <><TeamOverview membership={membership.data} />
        {membership.data.round === "1" && <RoundOnePreferences membership={membership.data}
          preferenceSettings={preferenceSettings} />}
        {membership.data.team.status === "approved"
          && (membership.data.round !== "1" || membership.data.team.preferenceStatus === "assigned")
          && <RoundSubmission round={round} maxFileSize={uploadLimits.roundSubmission}
            sectionNumber={round === "1" ? "03" : "01"} />}</>}
  </div>;
}

function StateCard({ title, description, retry }: { title: string; description: string; retry: () => void }) {
  const t = useTranslations("Dashboard");
  return <Card className="dashboard-state-card"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p>{description}</p><Button onClick={retry}><RefreshCwIcon aria-hidden="true" />{t("actions.retry")}</Button></CardContent></Card>;
}

function RegistrationForm({ session, round, maxCvFileSize, preferenceSettings }: {
  session: Session;
  round: "0.5" | "1";
  maxCvFileSize: number;
  preferenceSettings: RoundOnePreferenceSettings;
}) {
  const t = useTranslations("Dashboard");
  const [teamName, setTeamName] = useState("");
  const [captainFullName, setCaptainFullName] = useState(session.user.name);
  const captainEmail = session.user.email;
  const [captainBirthdate, setCaptainBirthdate] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [captainUniversityName, setCaptainUniversityName] = useState("");
  const [awarenessSource, setAwarenessSource] = useState<AwarenessSource | "">("");
  const [awarenessSourceDetail, setAwarenessSourceDetail] = useState("");
  const [teammates, setTeammates] = useState<Teammate[]>(
    Array.from({ length: TEAMMATE_COUNT }, (_, index) => emptyTeammate(`member-${index + 1}`)),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [cvFiles, setCvFiles] = useState<(File | null)[]>([null, null, null]);
  const [uploading, setUploading] = useState(false);
  const [preferenceIds, setPreferenceIds] = useState(["", "", ""]);
  const birthdateRange = getEligibleBirthdateRange();

  const onCreated = async () => {
    toast.success(t("success.created"));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.registration.current.queryKey({ round }) }),
      queryClient.invalidateQueries({ queryKey: trpc.registration.memberships.queryKey() }),
    ]);
  };
  const createRoundHalfTeam = useMutation(trpc.registration.createRoundHalfTeam.mutationOptions({ onSuccess: onCreated }));
  const createRoundOneTeam = useMutation(trpc.registration.createRoundOneTeam.mutationOptions({ onSuccess: onCreated }));
  const createCvUploadUrl = useMutation(trpc.registration.createRoundOneCvUploadUrl.mutationOptions());
  const isSubmitting = createRoundHalfTeam.isPending || createRoundOneTeam.isPending || uploading;
  const awarenessDetailRequired = awarenessSource !== "" &&
    awarenessSourcesRequiringDetail.includes(awarenessSource);

  const selectAwarenessSource = (source: AwarenessSource) => {
    setAwarenessSource(source);
    if (!awarenessSourcesRequiringDetail.includes(source)) {
      setAwarenessSourceDetail("");
    }
    setErrors((current) => {
      const { awarenessSource: _sourceError, awarenessSourceDetail: _detailError, ...remaining } = current;
      return remaining;
    });
  };

  const updateTeammate = <FieldName extends keyof Omit<Teammate, "id">>(id: string, field: FieldName, value: Teammate[FieldName]) => {
    setTeammates((current) =>
      current.map((member) => (member.id === id ? { ...member, [field]: value } : member)),
    );
  };

  const validate = () => {
    const next: FormErrors = {};
    const required = (key: string, value: string) => {
      if (!value.trim()) next[key] = t("validation.required");
    };
    const text = (key: string, value: string) => {
      required(key, value);
      if (containsEmoji(value)) next[key] = t("validation.emoji");
    };

    text("teamName", teamName);
    text("captainFullName", captainFullName);
    required("captainEmail", captainEmail);
    required("captainBirthdate", captainBirthdate);
    required("captainPhone", captainPhone);
    text("captainUniversityName", captainUniversityName);
    if (!awarenessSource) next.awarenessSource = t("validation.required");
    if (awarenessDetailRequired) {
      text("awarenessSourceDetail", awarenessSourceDetail);
      if (awarenessSourceDetail.length > 200) {
        next.awarenessSourceDetail = t("validation.maxCharacters", { count: 200 });
      }
    }
    const digits = captainPhone.replace(/\D/g, "");
    if (captainPhone && (!/^\+?[0-9\s()-]+$/.test(captainPhone) || digits.length < 8 || digits.length > 15)) {
      next.captainPhone = t("validation.phone");
    }

    const normalizedCaptainEmail = captainEmail.trim().toLowerCase();
    if (captainEmail && !emailPattern.test(normalizedCaptainEmail)) {
      next.captainEmail = t("validation.email");
    }
    if (captainBirthdate && !isEligibleBirthdate(captainBirthdate)) {
      next.captainBirthdate = t("validation.birthdate");
    }
    const emails = [normalizedCaptainEmail];
    teammates.forEach((member, index) => {
      const prefix = `teammates.${index}`;
      text(`${prefix}.fullName`, member.fullName);
      required(`${prefix}.email`, member.email);
      required(`${prefix}.birthdate`, member.birthdate);
      text(`${prefix}.universityName`, member.universityName);
      const email = member.email.trim().toLowerCase();
      if (member.email) {
        if (!emailPattern.test(email)) {
          next[`${prefix}.email`] = t("validation.email");
        } else if (!email.endsWith(gmailDomain)) {
          next[`${prefix}.email`] = t("validation.gmailEmail");
        }
      }
      if (member.birthdate && !isEligibleBirthdate(member.birthdate)) {
        next[`${prefix}.birthdate`] = t("validation.birthdate");
      }
      emails.push(email);
    });

    if (emails.some((email, index) => email && emails.indexOf(email) !== index)) {
      next.form = t("validation.duplicateEmail");
    }
    if (round === "1") cvFiles.forEach((file, index) => {
      if (!file) next[`cvs.${index}`] = t("validation.required");
      else if (!file.name.toLowerCase().endsWith(".pdf")) next[`cvs.${index}`] = t("registration.cv.fileType");
      else if (file.size === 0 || file.size > maxCvFileSize) {
        next[`cvs.${index}`] = t("registration.cv.fileSize", { maxSize: formatUploadLimit(maxCvFileSize) });
      }
    });
    if (round === "1" && (preferenceIds.some((id) => !id) || new Set(preferenceIds).size !== 3)) {
      next.preferences = t("preferences.validation");
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createRoundHalfTeam.reset(); createRoundOneTeam.reset();
    if (!validate()) return;
    const registration = {
      teamName,
      captainFullName,
      captainBirthdate,
      captainPhone,
      captainUniversityName,
      awarenessSource: awarenessSource as AwarenessSource,
      awarenessSourceDetail: awarenessDetailRequired ? awarenessSourceDetail : undefined,
      teammates: teammates.map(({ id: _id, ...member }) => member),
    };
    if (round === "0.5") return createRoundHalfTeam.mutate(registration);
    setUploading(true);
    try {
      const cvs = await Promise.all(cvFiles.map(async (file) => {
        const selected = file!;
        const metadata = { filename: selected.name, mimeType: "application/pdf" as const, fileSize: selected.size };
        const signed = await createCvUploadUrl.mutateAsync(metadata);
        const response = await fetch(signed.uploadUrl, {
          method: "PUT", body: selected,
          headers: { "Content-Type": "application/pdf" }
        });
        if (!response.ok) throw new Error("UPLOAD_FAILED");
        return { ...metadata, uploadId: signed.uploadId };
      }));
      await createRoundOneTeam.mutateAsync({ ...registration, cvs, preferenceIds });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message === "FILE_TOO_LARGE") {
        const latest = await queryClient.fetchQuery(trpc.uploadLimits.queryOptions());
        setErrors((current) => ({ ...current, form: t("registration.cv.fileSize", {
          maxSize: formatUploadLimit(latest.participantCv),
        }) }));
      } else if (message !== "EMAIL_ALREADY_REGISTERED" && message !== "DUPLICATE_EMAILS") {
        setErrors((current) => ({ ...current, form: t("registration.cv.uploadError") }));
      }
    } finally { setUploading(false); }
  };

  const mutation = createRoundHalfTeam.error ?? createRoundOneTeam.error;
  const mutationError = mutation
    ? mutation.data?.code === "CONFLICT"
      ? t("errors.conflict")
      : mutation.message === "DUPLICATE_EMAILS"
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
        <CardContent className={`dashboard-fields${round === "1" ? " round-one-member-fields" : ""}`}>
          <Field label={t("fields.fullName")} error={errors.captainFullName}>
            <Input value={captainFullName} onChange={(event) => setCaptainFullName(event.target.value)} aria-invalid={!!errors.captainFullName} />
          </Field>
          <Field label={t("fields.email")} error={errors.captainEmail}>
            <Input type="email" value={captainEmail} readOnly aria-readonly="true" aria-invalid={!!errors.captainEmail} />
          </Field>
          <Field label={t("fields.birthdate")} error={errors.captainBirthdate}>
            <Input type="date" min={birthdateRange.min} max={birthdateRange.max} value={captainBirthdate} onChange={(event) => setCaptainBirthdate(event.target.value)} aria-invalid={!!errors.captainBirthdate} />
          </Field>
          <Field label={t("fields.university")} error={errors.captainUniversityName}>
            <Input value={captainUniversityName} onChange={(event) => setCaptainUniversityName(event.target.value)} aria-invalid={!!errors.captainUniversityName} />
          </Field>
          {round === "1" && <Field
            label={t("registration.cv.memberLabel", { name: captainFullName || t("roles.captain") })}
            error={errors["cvs.0"]}>
            <><Input className="cv-file-input" type="file" accept=".pdf,application/pdf"
                aria-invalid={!!errors["cvs.0"]}
                onChange={(event) => setCvFiles((current) => current.map((file, fileIndex) =>
                  fileIndex === 0 ? event.target.files?.[0] ?? null : file))} />
              <span className="field-hint">{t("registration.cv.description", {
                maxSize: formatUploadLimit(maxCvFileSize),
              })}</span></>
          </Field>}
        </CardContent>
      </Card>

      <Card className="dashboard-card">
        <CardHeader className="roster-form-header">
          <div>
            <p className="dashboard-card-index">04 / {t("registration.membersSection")}</p>
            <CardTitle>{t("registration.membersTitle")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="teammate-list">
          <div className="registration-email-notice" role="note">
            <TriangleAlertIcon aria-hidden="true" />
            <p>{t("registration.memberEmailNotice")}</p>
          </div>
          {teammates.map((member, index) => (
            <section className="teammate-card" key={member.id} aria-labelledby={`${member.id}-title`}>
              <div className="teammate-heading">
                <h3 id={`${member.id}-title`}>{t("registration.memberNumber", { number: index + 2 })}</h3>
              </div>
              <div className={`dashboard-fields${round === "1" ? " round-one-member-fields" : ""}`}>
                <Field label={t("fields.fullName")} error={errors[`teammates.${index}.fullName`]}>
                  <Input value={member.fullName} onChange={(event) => updateTeammate(member.id, "fullName", event.target.value)} aria-invalid={!!errors[`teammates.${index}.fullName`]} />
                </Field>
                <Field label={t("fields.email")} error={errors[`teammates.${index}.email`]}>
                  <Input type="email" pattern=".+@gmail\.com" value={member.email} onChange={(event) => updateTeammate(member.id, "email", event.target.value)} aria-invalid={!!errors[`teammates.${index}.email`]} />
                </Field>
                <Field label={t("fields.birthdate")} error={errors[`teammates.${index}.birthdate`]}>
                  <Input type="date" min={birthdateRange.min} max={birthdateRange.max} value={member.birthdate} onChange={(event) => updateTeammate(member.id, "birthdate", event.target.value)} aria-invalid={!!errors[`teammates.${index}.birthdate`]} />
                </Field>
                <Field label={t("fields.university")} error={errors[`teammates.${index}.universityName`]}>
                  <Input value={member.universityName} onChange={(event) => updateTeammate(member.id, "universityName", event.target.value)} aria-invalid={!!errors[`teammates.${index}.universityName`]} />
                </Field>
                {round === "1" && <Field label={t("registration.cv.memberLabel", {
                  name: member.fullName || t("registration.memberNumber", { number: index + 2 }),
                })} error={errors[`cvs.${index + 1}`]}>
                  <><Input className="cv-file-input" type="file" accept=".pdf,application/pdf"
                      aria-invalid={!!errors[`cvs.${index + 1}`]}
                      onChange={(event) => setCvFiles((current) => current.map((file, fileIndex) =>
                        fileIndex === index + 1 ? event.target.files?.[0] ?? null : file))} />
                    <span className="field-hint">{t("registration.cv.description", {
                      maxSize: formatUploadLimit(maxCvFileSize),
                    })}</span></>
                </Field>}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      {round === "1" && <Card className="dashboard-card">
        <CardHeader>
          <p className="dashboard-card-index">05 / {t("preferences.section")}</p>
          <CardTitle>{t("preferences.title")}</CardTitle>
          <p>{t("preferences.description")}</p>
        </CardHeader>
        <CardContent>
          <PreferenceSelects settings={preferenceSettings} values={preferenceIds}
            onChange={setPreferenceIds} error={errors.preferences} disabled={isSubmitting} />
        </CardContent>
      </Card>}

      <Card className="dashboard-card">
        <CardHeader>
          <p className="dashboard-card-index">{round === "1" ? "06" : "05"} / {t("registration.awareness.section")}</p>
          <CardTitle>{t("registration.awareness.title")}</CardTitle>
          {/* <p>{t("registration.awareness.description")}</p> */}
        </CardHeader>
        <CardContent>
          <fieldset className="awareness-fieldset" aria-invalid={!!errors.awarenessSource}
            aria-describedby={errors.awarenessSource ? "awareness-source-error" : undefined}>
            <legend className="sr-only">{t("registration.awareness.title")}</legend>
            <div className="awareness-options">
              {awarenessSources.map((source) => (
                <label className="awareness-option" key={source}>
                  <input type="radio" name="awarenessSource" value={source}
                    checked={awarenessSource === source}
                    onChange={() => selectAwarenessSource(source)} />
                  <span>{t(`registration.awareness.options.${source}`)}</span>
                </label>
              ))}
            </div>
            {errors.awarenessSource &&
              <span className="field-error" id="awareness-source-error">{errors.awarenessSource}</span>}
          </fieldset>
          {awarenessDetailRequired && (
            <div className="awareness-detail">
              <Field label={t(`registration.awareness.detailLabels.${awarenessSource}`)}
                error={errors.awarenessSourceDetail}>
                <Input value={awarenessSourceDetail} maxLength={200}
                  placeholder={t(`registration.awareness.detailPlaceholders.${awarenessSource}`)}
                  onChange={(event) => setAwarenessSourceDetail(event.target.value)}
                  aria-invalid={!!errors.awarenessSourceDetail} />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {(errors.form || mutationError) && <p className="form-error" role="alert">{errors.form || mutationError}</p>}
      <div className="registration-submit">
        <p>{t("registration.submitNote")}</p>
        <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? t("actions.submitting") : t("actions.submit")}
        </Button>
      </div>
    </form>
  );
}

function PreferenceSelects({ settings, values, onChange, error, disabled = false }: {
  settings: RoundOnePreferenceSettings;
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("Dashboard");
  return <div className="preference-select-group">
    {values.map((value, index) => <Field key={index} label={t("preferences.rank", { rank: index + 1 })}>
      <select className="preference-select" value={value} disabled={disabled}
        aria-invalid={!!error} onChange={(event) => onChange(values.map((item, itemIndex) =>
          itemIndex === index ? event.target.value : item))}>
        <option value="">{t("preferences.selectPlaceholder")}</option>
        {settings.map((setting) => <option key={setting.id} value={setting.id}
          disabled={value !== setting.id && values.includes(setting.id)}>{setting.name}</option>)}
      </select>
    </Field>)}
    {error && <p className="field-error preference-error" role="alert">{error}</p>}
  </div>;
}

function RoundOnePreferences({ membership, preferenceSettings }: {
  membership: RoundOneMembership;
  preferenceSettings: RoundOnePreferenceSettings;
}) {
  const t = useTranslations("Dashboard");
  const [values, setValues] = useState(["", "", ""]);
  const [error, setError] = useState<string | undefined>();
  const submitPreferences = useMutation(trpc.registration.submitRoundOnePreferences.mutationOptions({
    onSuccess: async () => {
      toast.success(t("preferences.submitSuccess"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.registration.current.queryKey({ round: "1" }) }),
        queryClient.invalidateQueries({ queryKey: trpc.registration.memberships.queryKey() }),
      ]);
    },
    onError: (cause) => setError(cause.data?.code === "CONFLICT"
      ? t("preferences.alreadySubmitted") : t("preferences.submitError")),
  }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (values.some((id) => !id) || new Set(values).size !== 3) {
      setError(t("preferences.validation"));
      return;
    }
    setError(undefined);
    submitPreferences.mutate({ preferenceIds: values });
  };
  return <Card className="dashboard-card preference-card">
    <CardHeader>
      <div className="preference-heading-row">
        <div><p className="dashboard-card-index">02 / {t("preferences.section")}</p>
          <CardTitle>{t("preferences.title")}</CardTitle></div>
        <span className={`preference-status preference-status-${membership.team.preferenceStatus}`}>
          {t(`preferences.status.${membership.team.preferenceStatus}`)}
        </span>
      </div>
      <p>{t("preferences.description")}</p>
    </CardHeader>
    <CardContent>
      {membership.team.preferenceStatus === "not_submitted" ? membership.role === "captain" ?
        <form className="preference-form" onSubmit={submit} noValidate>
          {preferenceSettings.length < 3 ? <p className="form-error" role="alert">{t("preferences.unavailable")}</p> :
            <PreferenceSelects settings={preferenceSettings} values={values} onChange={setValues}
              error={error} disabled={submitPreferences.isPending} />}
          <Button type="submit" disabled={submitPreferences.isPending || preferenceSettings.length < 3}>
            {submitPreferences.isPending ? t("preferences.submitting") : t("preferences.submit")}
          </Button>
        </form> : <p className="preference-message">{t("preferences.captainRequired")}</p>
        : <div className="preference-summary">
          <ol>{membership.team.preferences.map((preference) => <li key={preference.id}>{preference.name}</li>)}</ol>
          {membership.team.preferenceStatus === "assigned" && membership.team.assignedTrack
            ? <div className="assigned-track"><span>{t("preferences.assignedTrack")}</span>
              <strong>{membership.team.assignedTrack.name}</strong></div>
            : <p className="preference-message">{t("preferences.waitingAssignment")}</p>}
        </div>}
    </CardContent>
  </Card>;
}

function TeamOverview({ membership }: { membership: Extract<Membership, { registered: true }> }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cvDownload = useMutation(trpc.registration.createRoundOneCvDownloadUrl.mutationOptions({
    onSuccess: ({ downloadUrl }) => window.location.assign(downloadUrl),
    onError: () => toast.error(t("registration.cv.downloadError")),
  }));
  const captain = membership.team.members.find((member) => member.isCaptain);
  return (
    <Accordion className="team-overview" value={detailsOpen ? ["registration-details"] : []}
      onValueChange={(value) => setDetailsOpen(value.includes("registration-details"))}>
      <AccordionItem className="team-overview-item" value="registration-details">
        <Card className="dashboard-card team-hero-card">
          <AccordionHeader className="team-hero-header">
            <AccordionTrigger className="team-hero-trigger">
              <span className="team-badges">
                <span className="role-badge">{t(`roles.${membership.role}`)}</span>
                <span className={`status-badge status-${membership.team.status}`}>{t(`status.${membership.team.status}`)}</span>
              </span>
              <span className="team-hero-copy">
                <span className="dashboard-card-index">01 / {t("overview.registration")}</span>
                <span className="team-hero-title">{membership.team.name}</span>
                <span className="team-hero-description">
                  {membership.role === "captain" ? t("overview.captainMessage") : t("overview.memberMessage")}
                </span>
              </span>
              <span className="team-accordion-action">
                <span>{detailsOpen ? t("overview.hideDetails") : t("overview.showDetails")}</span>
                <ChevronDownIcon aria-hidden="true" />
              </span>
            </AccordionTrigger>
          </AccordionHeader>
        </Card>
        <AccordionPanel className="team-details-panel">
          <div className="team-details-panel-inner">
            <div className="overview-grid">
              <Card className="dashboard-card">
                <CardHeader><CardTitle>{t("overview.details")}</CardTitle></CardHeader>
                <CardContent className="detail-list">
                  <Detail label={t("fields.teamName")} value={membership.team.name} />
                  <Detail label={t("overview.statusLabel")} value={t(`status.${membership.team.status}`)} />
                  <Detail label={t("overview.teamSize")} value={t("overview.people", { count: membership.team.members.length })} />
                  <Detail label={t("overview.admissionMethod")} value={t(`overview.admissionMethods.${membership.team.admissionMethod}`)} />
                </CardContent>
              </Card>
              <Card className="dashboard-card">
                <CardHeader><CardTitle>{t("overview.captainContact")}</CardTitle></CardHeader>
                <CardContent className="detail-list">
                  <Detail label={t("fields.fullName")} value={captain?.fullName ?? "-"} />
                  <Detail label={t("fields.email")} value={captain?.email ?? "-"} />
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
                      <th scope="col">{t("fields.birthdate")}</th>
                      <th scope="col">{t("fields.university")}</th>
                      <th scope="col" aria-label={t("roles.captain")} />
                    </tr>
                  </thead>
                  <tbody>
                    {membership.team.members.map((member, index) => (
                      <tr key={member.id}>
                        <td className="roster-index">{String(index + 1).padStart(2, "0")}</td>
                        <td><h3>{member.fullName}</h3><p>{member.email}</p></td>
                        <td><p>{format.dateTime(new Date(`${member.birthdate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}</p></td>
                        <td><p>{member.universityName}</p></td>
                        <td>{member.isCaptain && <span className="captain-tag">{t("roles.captain")}</span>}
                          {membership.role === "captain" && "hasCv" in member && member.hasCv && <Button size="sm" variant="outline"
                            disabled={cvDownload.isPending} onClick={() => cvDownload.mutate({ memberId: member.id })}>{t("registration.cv.download")}</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

function Field({ label, error, full = false, children }: { label: string; error?: string; full?: boolean; children: React.ReactNode }) {
  return <div className={`dashboard-field${full ? " field-full" : ""}`}><Label>{label}</Label>{children}{error && <span className="field-error">{error}</span>}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatUploadLimit(bytes: number) {
  return `${bytes / 1024 / 1024} MiB`;
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton"><Skeleton className="h-48 w-full" /><div><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div><Skeleton className="h-64 w-full" /></div>;
}
