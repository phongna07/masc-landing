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
	const sheetData: SheetData = [
		headers.map(headerCell),
		...submissions.map((submission) => [
			textCell(submission.teamName),
			textCell(statusLabels[submission.teamStatus]),
			textCell(submission.captainName),
			textCell(submission.captainEmail),
			textCell(submission.originalFilename),
			textCell(submission.mimeType),
			numberCell(submission.fileSize),
			dateCell(submission.createdAt),
			dateCell(submission.updatedAt),
		]),
	];

	const { default: writeExcelFile } = await import("write-excel-file/browser");
	await writeExcelFile(sheetData, {
		sheet: `Round ${round} Submissions`,
		columns: [
			{ width: 28 },
			{ width: 20 },
			{ width: 26 },
			{ width: 32 },
			{ width: 38 },
			{ width: 26 },
			{ width: 18 },
			{ width: 22 },
			{ width: 22 },
		],
		stickyRowsCount: 1,
		stickyColumnsCount: 2,
		orientation: "landscape",
	}).toFile(`masc-submissions-round-${round}-${localDateStamp()}.xlsx`);
}
