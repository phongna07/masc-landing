"use client";

import type { AdminRole } from "@masc-landing/api/admin-roles";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@masc-landing/ui/components/dialog";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading } from "../admin-state";

type EditableRole = Exclude<AdminRole, "developer">;
type AdminForm = { originalEmail?: string; email: string; role: EditableRole };
const editableRoles = ["root", "professional", "entrance-staff"] as const;

export default function AdminManagement() {
	const t = useTranslations("Admin.manageAdmins");
	const adminT = useTranslations("Admin");
	const queryClient = useQueryClient();
	const admins = useQuery(trpc.admin.manageAdmins.list.queryOptions());
	const [form, setForm] = useState<AdminForm | null>(null);
	const refresh = () => Promise.all([
		queryClient.invalidateQueries({ queryKey: trpc.admin.manageAdmins.list.queryKey() }),
		queryClient.invalidateQueries({ queryKey: trpc.admin.listUsers.queryKey() }),
	]);
	const onError = (error: { message: string }) => {
		const key = error.message === "emailExists" ? "emailExists"
			: error.message === "recordProtectedOrMissing" ? "recordProtectedOrMissing" : "operationFailed";
		toast.error(t(`errors.${key}`));
		void refresh();
	};
	const onSaved = async () => {
		setForm(null);
		toast.success(t("saved"));
		await refresh();
	};
	const create = useMutation(trpc.admin.manageAdmins.create.mutationOptions({ onSuccess: onSaved, onError }));
	const update = useMutation(trpc.admin.manageAdmins.update.mutationOptions({ onSuccess: onSaved, onError }));
	const remove = useMutation(trpc.admin.manageAdmins.delete.mutationOptions({
		onSuccess: async () => { toast.success(t("deleted")); await refresh(); }, onError,
	}));
	const pending = create.isPending || update.isPending || remove.isPending;

	return <>
		<AdminHeading eyebrow={adminT("eyebrow")} title={t("title")} description={t("description")} />
		<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
			<p className="text-sm text-muted-foreground">{t("developerNotice")}</p>
			<Button disabled={pending} onClick={() => setForm({ email: "", role: "professional" })}><PlusIcon aria-hidden="true" />{t("create")}</Button>
		</div>
		{admins.isPending ? <AdminLoading /> : admins.isError ? (
			<AdminError title={t("loadErrorTitle")} description={t("loadError")} retry={() => admins.refetch()} retryLabel={adminT("actions.retry")} />
		) : admins.data.length === 0 ? (
			<AdminEmpty title={t("emptyTitle")} description={t("emptyDescription")} />
		) : <Card className="admin-table-card"><CardContent className="admin-table-scroll">
			<table className="admin-table">
				<thead><tr><th scope="col">{adminT("fields.email")}</th><th scope="col">{adminT("fields.role")}</th><th scope="col">{t("actions")}</th></tr></thead>
				<tbody>{admins.data.map((admin) => <tr key={admin.email}>
					<td><strong>{admin.email}</strong></td>
					<td><span className="admin-badge">{adminT(`roles.${admin.role}`)}</span></td>
					<td>{admin.role === "developer" ? <span>{t("readOnly")}</span> : <div className="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" disabled={pending} aria-label={t("editAdmin", { email: admin.email })}
							onClick={() => setForm({ originalEmail: admin.email, email: admin.email, role: admin.role as EditableRole })}>
							<PencilIcon aria-hidden="true" />{t("edit")}</Button>
						<ConfirmationDialog trigger={<Button size="sm" variant="destructive" disabled={pending} aria-label={t("deleteAdmin", { email: admin.email })}>
							<TrashIcon aria-hidden="true" />{t("delete")}</Button>}
							title={t("deleteTitle")} description={t("deleteDescription", { email: admin.email })}
							confirmLabel={t("delete")} cancelLabel={adminT("actions.cancel")} tone="destructive" icon={<TrashIcon />}
							onConfirm={() => remove.mutate({ originalEmail: admin.email })} />
					</div>}</td>
				</tr>)}</tbody>
			</table>
		</CardContent></Card>}
		<Dialog open={form !== null} onOpenChange={(open) => { if (!open && !pending) setForm(null); }}>
			<DialogContent className="p-6">
				<DialogHeader><DialogTitle>{t(form?.originalEmail ? "editTitle" : "create")}</DialogTitle><DialogDescription>{t("formDescription")}</DialogDescription></DialogHeader>
				{form && <form className="admin-management-form mt-6 grid gap-5" onSubmit={(event) => {
					event.preventDefault();
					if (pending) return;
					if (form.originalEmail) update.mutate({ ...form, originalEmail: form.originalEmail });
					else create.mutate({ email: form.email, role: form.role });
				}}>
					<div className="grid gap-2"><Label htmlFor="admin-email">{adminT("fields.email")}</Label>
						<Input id="admin-email" type="email" autoComplete="off" required maxLength={254} value={form.email} disabled={pending}
							onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
					<div className="grid gap-2"><Label htmlFor="admin-role">{adminT("fields.role")}</Label>
						<select id="admin-role" value={form.role} disabled={pending}
							onChange={(event) => setForm({ ...form, role: event.target.value as EditableRole })}>
							{editableRoles.map((role) => <option key={role} value={role}>{adminT(`roles.${role}`)}</option>)}
						</select></div>
					<DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setForm(null)}>{adminT("actions.cancel")}</Button>
						<Button type="submit" disabled={pending || !form.email.trim()}>{t(pending ? "saving" : "save")}</Button></DialogFooter>
				</form>}
			</DialogContent>
		</Dialog>
	</>;
}
