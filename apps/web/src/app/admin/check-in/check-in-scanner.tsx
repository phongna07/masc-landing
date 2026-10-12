"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { Input } from "@masc-landing/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { IScannerControls } from "@zxing/browser";
import { trpc } from "@/utils/trpc";
import { TicketHeading, TicketError } from "@/components/tickets/ticket-ui";
import { EventTime } from "@/components/tickets/ticket-card";
import { CheckCircle2Icon, XCircleIcon, ScanLineIcon, PauseIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";

export default function CheckInScanner({ isRoot }: { isRoot: boolean }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const [code, setCode] = useState("");
	const [online, setOnline] = useState(true);
	const [cameraState, setCameraState] = useState("idle");
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [deviceId, setDeviceId] = useState("");
	const [overrideReason, setOverrideReason] = useState("");
	const videoRef = useRef<HTMLVideoElement>(null);
	const controlsRef = useRef<IScannerControls | null>(null);
	const detectionRef = useRef(false);
	const confirmKey = useRef<string | null>(null);
	const cameraGeneration = useRef(0);
	const lookup = useMutation(trpc.tickets.lookup.mutationOptions({
		onSuccess: result => {
			if (result.outcome === "ready") notify.info(t("scan.ready"), { id: "ticket-lookup" });
			else notify.warning(t.has(`scan.${result.outcome}`) ? t(`scan.${result.outcome}`) : t("errors.operationFailed"), { id: "ticket-lookup" });
		},
		onError: notify.error,
	}));
	const admission = useMutation(trpc.tickets.checkIn.mutationOptions({
		onSuccess: result => {
			notify.dismiss("ticket-lookup");
			if (result.outcome === "accepted") notify.success(t("admissionAccepted"), { id: "ticket-admission" });
			else notify.warning(t.has(`scan.${result.reason}`) ? t(`scan.${result.reason}`) : t("errors.operationFailed"), { id: "ticket-admission" });
		},
		onError: notify.error,
	}));
	const busy = lookup.isPending || admission.isPending;

	function stopCamera() { cameraGeneration.current++; controlsRef.current?.stop(); controlsRef.current = null; }
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		update(); window.addEventListener("online", update); window.addEventListener("offline", update);
		return () => { stopCamera(); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
	}, []);

	function lookupCode(value: string) {
		notify.dismiss("ticket-admission"); notify.dismiss("ticket-lookup");
		stopCamera(); setCameraState("paused"); detectionRef.current = true;
		admission.reset(); lookup.reset(); setOverrideReason(""); confirmKey.current = crypto.randomUUID();
		setCode(value.slice(0, 120)); lookup.mutate({ code: value.slice(0, 120), requestKey: crypto.randomUUID() });
	}

	async function startCamera() {
		notify.dismiss("ticket-admission"); notify.dismiss("ticket-lookup");
		stopCamera(); detectionRef.current = false; setCameraState("starting");
		lookup.reset(); admission.reset(); confirmKey.current = null;
		const generation = cameraGeneration.current;
		if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setCameraState("unavailable"); notify.warning(t("camera.unavailable")); return; }
		try {
			const { BrowserQRCodeReader } = await import("@zxing/browser");
			if (generation !== cameraGeneration.current || !videoRef.current) return;
			const reader = new BrowserQRCodeReader();
			const controls = await reader.decodeFromConstraints({ audio: false, video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } } }, videoRef.current, (result, _error, controls) => {
				if (!result || detectionRef.current || generation !== cameraGeneration.current) return;
				detectionRef.current = true; controls.stop(); lookupCode(result.getText());
			});
			if (generation !== cameraGeneration.current) { controls.stop(); return; }
			controlsRef.current = controls;
			const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "videoinput");
			if (generation !== cameraGeneration.current) { controls.stop(); return; }
			setDevices(cameras);
			setCameraState("scanning");
			notify.info(t("notifications.cameraStarted"));
		} catch (error) {
			if (generation !== cameraGeneration.current) return;
			stopCamera();
			const name = error instanceof Error ? error.name : "";
			const state = name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "NotReadableError" ? "unavailable" : "error";
			setCameraState(state); notify.warning(t(`camera.${state}`));
		}
	}
	const ticket = lookup.data?.ticket;
	const admitted = admission.data?.outcome === "accepted";
	const outcome = admission.data?.outcome === "rejected" ? admission.data.reason : lookup.data?.outcome;
	return <><TicketHeading admin title={t("checkIn")} description={t("checkInHelp")} />{!online && <p role="alert" className="ticket-danger">{t("offline")}</p>}
		<div className="ticket-scanner-grid"><section className="ticket-panel"><h2>{t("cameraScanner")}</h2><p>{t("cameraCompatibility")}</p><video ref={videoRef} className="ticket-video" muted playsInline aria-label={t("cameraPreview")} />
			{devices.length > 1 && <label>{t("selectCamera")}<select value={deviceId} onChange={e => { stopCamera(); setCameraState("idle"); setDeviceId(e.target.value); notify.info(t("notifications.cameraSelected")); }}><option value="">{t("rearCamera")}</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || t("cameraNumber", { number: index + 1 })}</option>)}</select></label>}
			<p role="status">{t(`camera.${cameraState}`)}</p><div className="ticket-actions"><Button className="ticket-button-utility" type="button" disabled={!online || busy || cameraState === "starting" || cameraState === "scanning"} onClick={() => void startCamera()}><ScanLineIcon aria-hidden="true" />{t("startScanner")}</Button><Button type="button" variant="outline" disabled={cameraState !== "scanning"} onClick={() => { stopCamera(); setCameraState("paused"); notify.info(t("notifications.cameraPaused")); }}><PauseIcon aria-hidden="true" />{t("pauseScanner")}</Button></div>
		</section><form className="ticket-panel" onSubmit={e => { e.preventDefault(); lookupCode(code); }}><h2>{t("lookupTicket")}</h2><label>{t("manualCode")}<Input maxLength={120} onFocus={() => { stopCamera(); setCameraState("paused"); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={e => { setCode(e.target.value); lookup.reset(); admission.reset(); notify.dismiss("ticket-admission"); notify.dismiss("ticket-lookup"); }} disabled={busy} /></label><Button className="ticket-button-utility" type="submit" disabled={!online || busy || !code.trim()}><SearchIcon aria-hidden="true" />{t("lookupTicket")}</Button><TicketError error={lookup.error} /></form></div>
		{lookup.data && <section className={`ticket-panel ${admitted ? "ticket-success" : outcome !== "ready" ? "ticket-danger" : ""}`} aria-live="assertive"><h2 className="ticket-outcome-heading">{admitted ? <CheckCircle2Icon aria-hidden="true" /> : outcome === "ready" ? <ScanLineIcon aria-hidden="true" /> : <XCircleIcon aria-hidden="true" />}{t(admitted ? "admissionAccepted" : `scan.${outcome}`)}</h2>
			{admitted && <p><EventTime value={admission.data!.createdAt} timezone={ticket?.event.timezone ?? "Asia/Ho_Chi_Minh"} /></p>}
			{ticket && <><h3>{t(`categories.${ticket.category}`)} · {t(`validity.${ticket.validity}`)}</h3>{ticket.recipientName && <p>{t("recipientName")}: {ticket.recipientName}</p>}<p>{t("acceptedCount", { count: admission.data?.acceptedCount ?? ticket.acceptedCount })}</p>{ticket.benefits.includes("networkingLunch") && <p className="ticket-benefit">{t("networkingLunch")}</p>}
				{ticket.acceptedCount > 0 && <p className="ticket-warning">{t("repeatWarning")}</p>}
				{ticket.validity === "valid" && !admitted && <>{isRoot && ticket.acceptedCount > 0 && <label>{t("overrideReason")}<Textarea maxLength={1000} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} /></label>}<Button className={ticket.acceptedCount > 0 ? "ticket-button-warning" : "ticket-button-success"} type="button" disabled={!online || busy || (ticket.acceptedCount > 0 && (!isRoot || !overrideReason.trim()))} onClick={() => { confirmKey.current ??= crypto.randomUUID(); admission.mutate({ ticketId: ticket.id, credentialVersion: ticket.credentialVersion, requestKey: confirmKey.current, ...(ticket.acceptedCount > 0 && isRoot ? { overrideReason } : {}) }); }}>{ticket.acceptedCount > 0 ? <ShieldAlertIcon aria-hidden="true" /> : <CheckCircle2Icon aria-hidden="true" />}{t(ticket.acceptedCount > 0 ? "confirmOverride" : "confirmAdmission")}</Button></>}
				<h3>{t("history")}</h3>{lookup.data.history.filter(event => event.outcome === "accepted").map(event => <p className="ticket-warning" key={event.id}>{t("outcomes.accepted")} · <EventTime value={event.createdAt} timezone={ticket.event.timezone} /></p>)}
				<details><summary>{t("rejectedAttempts")}</summary>{lookup.data.history.filter(event => event.outcome === "rejected").map(event => <p key={event.id}>{t("outcomes.rejected")} · <EventTime value={event.createdAt} timezone={ticket.event.timezone} /></p>)}</details>
			</>}<TicketError error={admission.error} />
		</section>}
	</>;
}
