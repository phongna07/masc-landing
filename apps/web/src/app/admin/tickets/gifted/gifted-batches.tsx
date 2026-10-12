"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { Input } from "@masc-landing/ui/components/input";
import { ArrowUpRightIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/utils/trpc";
import AdminFilters, { emptyTicketFilters } from "@/components/tickets/admin-filters";
import { Pagination, TicketHeading, TicketLoading, TicketEmpty, TicketError } from "@/components/tickets/ticket-ui";

export default function GiftedBatches() {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const router = useRouter();
	const [page, setPage] = useState(0);
	const [filters, setFilters] = useState(emptyTicketFilters);
	const batches = useQuery(trpc.tickets.batches.queryOptions({ ...filters, page }));
	const [quantity, setQuantity] = useState(1);
	const [category, setCategory] = useState<"normal" | "vip">("normal");
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const key = useRef<string | null>(null);
	const create = useMutation(trpc.tickets.createBatch.mutationOptions({ onSuccess: batch => { notify.success(t("notifications.batchCreated", { count: batch.quantity })); router.push(`/admin/tickets/gifted/${batch.id}`); }, onError: notify.error }));
	return <><TicketHeading admin title={t("gifted")} description={t("giftHelp")} /><form className="ticket-panel" onSubmit={e => { e.preventDefault(); key.current ??= crypto.randomUUID(); create.mutate({ requestKey: key.current, quantity, category, title, note }); }}><h2>{t("createBatch")}</h2><div className="ticket-form-grid"><label className="ticket-field-full">{t("batchTitle")}<Input maxLength={120} value={title} disabled={Boolean(key.current)} onChange={e => setTitle(e.target.value)} required /></label><label>{t("batchQuantity")}<Input type="number" min={1} max={100} value={quantity} disabled={Boolean(key.current)} onChange={e => setQuantity(Number(e.target.value))} required /></label><label>{t("category")}<select value={category} disabled={Boolean(key.current)} onChange={e => setCategory(e.target.value as typeof category)}><option value="normal">{t("categories.normal")}</option><option value="vip">{t("categories.vip")}</option></select></label><label className="ticket-field-full">{t("batchNote")}<Textarea maxLength={1000} value={note} disabled={Boolean(key.current)} onChange={e => setNote(e.target.value)} /></label></div><p>{t("batchNoteHelp")}</p><TicketError error={create.error} /><Button type="submit" disabled={create.isPending}>{t("generateTickets")}</Button></form>
		<AdminFilters gifted value={filters} onChange={value => { setFilters(value); setPage(0); }} /><TicketError error={batches.error} />{batches.isPending && <TicketLoading />}{batches.data?.total === 0 && <TicketEmpty message={t("noBatches")} />}{batches.data?.items.map(batch => <article className="ticket-panel" key={batch.id}><h2><Link className="ticket-detail-link" href={`/admin/tickets/gifted/${batch.id}`}>{batch.title}<ArrowUpRightIcon aria-hidden="true" /></Link></h2><p>{t(`categories.${batch.category}`)} · {t("quantity", { count: batch.quantity })}</p><p>{batch.note}</p></article>)}{batches.data && <Pagination page={page} total={batches.data.total} pageSize={batches.data.pageSize} setPage={setPage} />}
	</>;
}
