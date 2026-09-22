import type { AppRouter } from "@masc-landing/api/routers/index";
import type { RoundId } from "@masc-landing/api/rounds";
import type { inferRouterOutputs } from "@trpc/server";
import type { Cell, SheetData } from "write-excel-file/browser";

type RoundSubmissions = inferRouterOutputs<AppRouter>["admin"]["listRoundSubmissions"];

const statusLabels = {
	pending: "Pending review",
	approved: "Approved",
	rejected: "Rejected",
} as const;

const preferenceStatusLabels = {
	not_submitted: "Not submitted",
	submitted: "Submitted",
	assigned: "Assigned",
} as const;

const admissionMethodLabels = {
	direct: "Direct application",
	cv_screening: "CV screening",
	round_0_5_promotion: "Promoted from Round 0.5",
} as const;

const awarenessSourceLabels = {
	masc_fanpage: "MASC Fanpage",
	masc_community_group: "MASC Community Group",
	other_facebook_group: "Another Facebook group",
	other_organization_fanpage: "Another organization or club's fanpage",
	media_ambassador: "Media ambassador",
} as const;

const headerStyle = {
	backgroundColor: "#6550ED",
	textColor: "#FFFFFF",
	fontWeight: "bold" as const,
	align: "center" as const,
	alignVertical: "center" as const,
	wrap: true,
};

function textCell(value: string | null | undefined): Cell {
	return value ? { value, type: String } : null;
}

function numberCell(value: number): Cell {
	return { value, type: Number, format: "#,##0" };
}

function booleanCell(value: boolean): Cell {
	return { value, type: Boolean };
}

function dateCell(value: string | Date): Cell {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : { value: date, type: Date, format: "yyyy-mm-dd hh:mm" };
}

function headerCell(value: string): Cell {
	return { value, type: String, ...headerStyle };
}

function localDateStamp(date = new Date()) {
	const year = String(date.getFullYear());
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export async function exportRoundSubmissionsToExcel(round: RoundId, submissions: RoundSubmissions) {
	const headers = [
		"Team Name",
		"Registration Status",
		"Captain Name",
		"Captain Email",
		"Original Filename",
		"MIME Type",
		"File Size (Bytes)",
		"First Submitted At",
		"Last Submitted At",
	];
	const columns = [
		{ width: 28 },
		{ width: 20 },
		{ width: 26 },
		{ width: 32 },
		{ width: 38 },
		{ width: 26 },
		{ width: 18 },
		{ width: 22 },
		{ width: 22 },
	];
	if (round === "1") {
		headers.splice(1, 0,
			"Team ID",
			"Assigned Track",
			"Preference Status",
			"Track Preferences",
			"Admission Method",
			"Is Eliminated",
			"Team Registered At",
			"Captain Phone",
			"Awareness Source",
			"Awareness Source Detail",
			"Source Team ID",
			"Source Team Name",
		);
		columns.splice(1, 0,
			{ width: 38 },
			{ width: 32 },
			{ width: 20 },
			{ width: 54 },
			{ width: 26 },
			{ width: 16 },
			{ width: 22 },
			{ width: 20 },
			{ width: 30 },
			{ width: 36 },
			{ width: 38 },
			{ width: 28 },
		);
	}
	const sheetData: SheetData = [
		headers.map(headerCell),
		...submissions.map((submission) => {
			const row: Cell[] = [textCell(submission.teamName)];
			if (round === "1") {
				const team = submission.roundOneTeam;
				row.push(
					textCell(submission.teamId),
					textCell(team?.assignedTrack?.name),
					textCell(team ? preferenceStatusLabels[team.preferenceStatus] : null),
					textCell(team?.preferences.map((preference, index) => `${index + 1}. ${preference.name}`).join(" | ")),
					textCell(team ? admissionMethodLabels[team.admissionMethod] : null),
					team ? booleanCell(team.isEliminated) : null,
					team ? dateCell(team.registeredAt) : null,
					textCell(team?.captainPhone),
					textCell(team?.awarenessSource ? awarenessSourceLabels[team.awarenessSource] : null),
					textCell(team?.awarenessSourceDetail),
					textCell(team?.sourceTeamId),
					textCell(team?.sourceTeamName),
				);
			}
			row.push(
				textCell(statusLabels[submission.teamStatus]),
				textCell(submission.captainName),
				textCell(submission.captainEmail),
				textCell(submission.originalFilename),
				textCell(submission.mimeType),
				numberCell(submission.fileSize),
				dateCell(submission.createdAt),
				dateCell(submission.updatedAt),
			);
			return row;
		}),
	];

	const { default: writeExcelFile } = await import("write-excel-file/browser");
	await writeExcelFile(sheetData, {
		sheet: `Round ${round} Submissions`,
		columns,
		stickyRowsCount: 1,
		stickyColumnsCount: 2,
		orientation: "landscape",
	}).toFile(`masc-submissions-round-${round}-${localDateStamp()}.xlsx`);
}
