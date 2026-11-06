import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { S3Client } from "@aws-sdk/client-s3";
import { drizzle } from "drizzle-orm/pglite";
import type { Context } from "./context";
import { roundFromSlug, roundIds, roundSchema } from "./rounds";
import { roundSubmissionExtension, roundSubmissionFilename, roundSubmissionMimeTypes } from "./submission-files";

// Exercise the new migration, queries, and tRPC middleware in isolated PostgreSQL.
// Only the external database connection and R2 transport are replaced.
type Snapshot = {
	enums: Record<string, { name: string; values: string[] }>;
	tables: Record<string, {
		name: string;
		columns: Record<string, { name: string; type: string; primaryKey: boolean; notNull: boolean; default?: string | number | boolean }>;
		uniqueConstraints: Record<string, { name: string; columns: string[] }>;
		checkConstraints: Record<string, { name: string; value: string }>;
		indexes: Record<string, { name: string; isUnique: boolean; columns: { isExpression: boolean; expression: string }[]; where?: string }>;
	}>;
};

const client = new PGlite();
const db = drizzle(client);
const database = Object.assign(db, {
	batch: (queries: { getSQL(): ReturnType<typeof import("drizzle-orm").sql> }[]) =>
		db.transaction(async (tx) => {
			const results = [];
			for (const query of queries) results.push(await tx.execute(query.getSQL()));
			return results;
		}),
});
mock.module("@masc-landing/db", { namedExports: { db: database } });
mock.module("@masc-landing/env/server", { namedExports: { env: { R2_ACCOUNT_ID: "test", R2_BUCKET: "test" } } });
const signedCommands: { input: { Key?: string; ContentType?: string; ResponseContentDisposition?: string } }[] = [];
mock.module("@aws-sdk/s3-request-presigner", { namedExports: {
	getSignedUrl: async (_client: unknown, command: typeof signedCommands[number]) => {
		signedCommands.push(command);
		return "https://example.com/isolated-test-upload";
	},
} });
let objectSize = 42;
let objectMimeType = "application/pdf";
mock.method(S3Client.prototype, "send", async () => ({ ContentLength: objectSize, ContentType: objectMimeType }));
const { adminRouter } = await import("./routers/admin");
const { roundSubmissionRouter } = await import("./routers/round-submission");
const { roundProblemStatementRouter } = await import("./routers/round-problem-statement");
const { getRoundMembership, getRoundMemberships } = await import("./registration-memberships");

function context(email = "admin@example.com", id = "admin"): Context {
	const now = new Date();
	const session = {
		user: { id, name: "Test User", email, emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: id, token: "test-token", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return { auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => session };
}
const admin = adminRouter.createCaller(context());
const participant = roundSubmissionRouter.createCaller(context("captain@example.com", "captain"));
const teammate = roundSubmissionRouter.createCaller(context("member@example.com", "member"));

before(async () => {
	const directory = new URL("../../db/src/migrations/", import.meta.url);
	// Migration history begins after the original tables were created. Reconstruct
	// that baseline from the preceding snapshot, then apply the new migration.
	const snapshot = JSON.parse(await readFile(new URL("meta/0031_snapshot.json", directory), "utf8")) as Snapshot;
	const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
	for (const item of Object.values(snapshot.enums)) {
		await client.exec(`CREATE TYPE ${identifier(item.name)} AS ENUM (${item.values.map(value => `'${value.replaceAll("'", "''")}'`).join(",")})`);
	}
	for (const table of Object.values(snapshot.tables)) {
		const columns = Object.values(table.columns).map((column) =>
			`${identifier(column.name)} ${column.type} ${column.primaryKey ? "PRIMARY KEY" : ""} ${column.notNull ? "NOT NULL" : ""} ${column.default !== undefined ? `DEFAULT ${column.default}` : ""}`);
		for (const constraint of Object.values(table.uniqueConstraints)) {
			columns.push(`CONSTRAINT ${identifier(constraint.name)} UNIQUE (${constraint.columns.map(identifier).join(",")})`);
		}
		for (const constraint of Object.values(table.checkConstraints)) {
			columns.push(`CONSTRAINT ${identifier(constraint.name)} CHECK (${constraint.value})`);
		}
		await client.exec(`CREATE TABLE ${identifier(table.name)} (${columns.join(",")})`);
	}
	for (const table of Object.values(snapshot.tables)) {
		for (const index of Object.values(table.indexes)) {
			const columns = index.columns.map((column) => column.isExpression ? column.expression : identifier(column.expression));
			await client.exec(`CREATE ${index.isUnique ? "UNIQUE" : ""} INDEX ${identifier(index.name)} ON ${identifier(table.name)} (${columns.join(",")}) ${index.where ? `WHERE ${index.where}` : ""}`);
		}
	}
	for (const statement of (await readFile(new URL("0032_skinny_mattie_franklin.sql", directory), "utf8")).split("--> statement-breakpoint")) {
		if (statement.trim()) await client.exec(statement);
	}
});
after(() => client.close());
beforeEach(async () => {
	const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
	await client.exec(`TRUNCATE ${tables.rows.map(row => `"${row.tablename}"`).join(", ")} CASCADE`);
	await client.exec(`
		INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
			('admin', 'Admin', 'admin@example.com', true, now(), now()),
			('captain', 'Captain', 'captain@example.com', true, now(), now()),
			('member', 'Member', 'member@example.com', true, now(), now());
		INSERT INTO admin_emails VALUES ('admin@example.com', 'developer');
		INSERT INTO teams (id, team_name, registration_status, captain_id, captain_phone)
			VALUES ('half', 'Test Team', 'approved', 'captain', '0123456789');
		INSERT INTO round_2_teams (id, team_name, captain_id, captain_phone, source_round_0_5_team_id)
			VALUES ('two', 'Test Team', 'captain', '0123456789', 'half');
		INSERT INTO round_3_teams (id, team_name, captain_id, captain_phone, source_round_2_team_id)
			VALUES ('three', 'Test Team', 'captain', '0123456789', 'two');
		INSERT INTO round_3_members (id, team_id, is_captain, full_name, email, birth_date, university_name) VALUES
			('c', 'three', true, 'Captain', 'captain@example.com', '2000-01-01', 'University'),
			('m', 'three', false, 'Member', 'member@example.com', '2001-01-01', 'University'),
			('o', 'three', false, 'Other', 'other@example.com', '2002-01-01', 'University');
	`);
	objectSize = 42;
	objectMimeType = "application/pdf";
	signedCommands.length = 0;
});

async function promoteBoth() {
	const four = (await admin.promoteTeams({ sourceRound: "3", targetRound: "4", teamIds: ["three"] })).results[0]!;
	assert.equal(four.success, true);
	if (!four.success) throw new Error("Promotion failed");
	const five = (await admin.promoteTeams({ sourceRound: "4", targetRound: "5", teamIds: [four.targetTeamId] })).results[0]!;
	assert.equal(five.success, true);
	return four.targetTeamId;
}

test("round IDs, slugs, and renamed files cover both new rounds", () => {
	assert.deepEqual(roundIds, ["0.5", "1", "2", "3", "4", "5"]);
	for (const round of ["4", "5"] as const) {
		assert.equal(roundSchema.parse(round), round);
		assert.equal(roundFromSlug(`round-${round}`), round);
	}
	assert.equal(roundFromSlug("round-6"), null);
	assert.equal(roundSubmissionFilename(" Team/A ", "4"), "MASC'26_Team_A_Mini Case Submission.pdf");
	assert.equal(roundSubmissionFilename(" Team/A ", "5"), "MASC'26_Team_A_Final Slide Presentation Submission.pdf");
});

test("sequential promotion preserves rosters, source links, and notifications without copying submissions", async () => {
	await promoteBoth();
	const memberships = await getRoundMemberships({ id: "captain", email: "captain@example.com" });
	for (const round of ["4", "5"] as const) {
		const membership = memberships[round];
		assert.equal(membership.registered, true);
		if (!membership.registered) throw new Error("Missing membership");
		assert.equal(membership.team.sourceRound, round === "4" ? "3" : "4");
		assert.deepEqual(membership.team.members.map(member => member.fullName), ["Captain", "Member", "Other"]);
		assert.equal((await admin.listTeams({ round })).length, 1);
		assert.equal((await admin.exportTeams({ round }))[0]!.sourceRound, membership.team.sourceRound);
		assert.equal((await participant.current({ round })).submission, null);
	}
	const announcements = await client.query("SELECT promoted_round FROM user_announcements WHERE user_id = 'captain' ORDER BY promoted_round");
	assert.deepEqual(announcements.rows, [{ promoted_round: 4 }, { promoted_round: 5 }]);
	assert.equal((await getRoundMembership({ id: "outsider", email: "outsider@example.com" }, "4")).registered, false);
});

test("promotion rejects skips, unapproved/eliminated teams, and duplicate membership", async () => {
	await assert.rejects(admin.promoteTeams({ sourceRound: "3", targetRound: "5", teamIds: ["three"] } as never), { code: "BAD_REQUEST" });
	for (const [update, reason] of [
		["registration_status = 'pending'", "SOURCE_NOT_APPROVED"],
		["registration_status = 'approved', is_eliminated = true", "SOURCE_ELIMINATED"],
	] as const) {
		await client.exec(`UPDATE round_3_teams SET ${update}`);
		const result = (await admin.promoteTeams({ sourceRound: "3", targetRound: "4", teamIds: ["three"] })).results[0]!;
		assert.equal(result.success, false);
		if (!result.success) assert.equal(result.reason, reason);
	}
	await client.exec("UPDATE round_3_teams SET is_eliminated = false");
	await promoteBoth();
	const again = (await admin.promoteTeams({ sourceRound: "3", targetRound: "4", teamIds: ["three"] })).results[0]!;
	assert.equal(again.success, false);
	if (!again.success) assert.equal(again.reason, "MEMBER_CONFLICT");
	assert.equal((await admin.listTeams({ round: "4" })).length, 1);
});

test("settings are independent and retain later-round defaults", async () => {
	for (const round of ["4", "5"] as const) {
		assert.equal((await admin.getDashboardTabSettings())[round], true);
		assert.equal((await admin.getSubmissionSettings())[round], false);
		assert.equal((await admin.getRoundEndSettings())[round], false);
		assert.equal((await admin.getProblemStatementPublicationSettings())[round], false);
	}
	await admin.setRoundSubmissionOpen({ round: "4", isOpen: true });
	await admin.setRoundEnded({ round: "4", isEnded: true });
	await admin.setDashboardTabVisible({ round: "4", isVisible: false });
	assert.equal((await admin.getSubmissionSettings())["4"], true);
	assert.equal((await admin.getSubmissionSettings())["5"], false);
	assert.equal((await admin.getRoundEndSettings())["5"], false);
	assert.equal((await admin.getDashboardTabSettings())["5"], true);
});

test("uploads enforce closure, PDF validation, attempts, isolation, and published feedback", async () => {
	await promoteBoth();
	for (const round of ["4", "5"] as const) {
		const file = { round, filename: "original.pdf", mimeType: "application/pdf", fileSize: 42 };
		await assert.rejects(participant.createUploadUrl(file), { message: "ROUND_SUBMISSION_CLOSED" });
		await admin.setRoundSubmissionOpen({ round, isOpen: true });
		await assert.rejects(participant.createUploadUrl({ ...file, filename: "bad.exe" }), { message: "UNSUPPORTED_FILE" });
		await assert.rejects(participant.createUploadUrl({ ...file, fileSize: 21 * 1024 * 1024 }), { code: "BAD_REQUEST" });
		const first = await teammate.createUploadUrl(file);
		objectSize = 43;
		await assert.rejects(teammate.finalize({ ...file, uploadId: first.uploadId, description: "" }), { message: "UPLOAD_MISMATCH" });
		objectSize = 42;
		for (let attempt = 1; attempt <= 3; attempt++) {
			const upload = await teammate.createUploadUrl(file);
			assert.equal((await teammate.finalize({ ...file, uploadId: upload.uploadId, description: "Question" })).attemptNumber, attempt);
		}
		await assert.rejects(participant.createUploadUrl(file), { message: "ATTEMPT_LIMIT_REACHED" });
		const current = await participant.current({ round });
		assert.equal(current.attemptsUsed, 3);
		assert.equal(current.submission!.originalFilename, roundSubmissionFilename("Test Team", round));
		const submissions = await admin.listRoundSubmissions({ round });
		assert.equal(submissions.length, 1);
		const submissionId = submissions[0]!.id;
		await admin.saveRoundFeedbackDraft({ round, submissionId, feedback: "Draft", score: 80 });
		assert.equal((await participant.current({ round })).submission!.feedback, null);
		await admin.publishRoundFeedback({ round, submissionId, feedback: "Published", score: 90 });
		assert.equal((await participant.current({ round })).submission!.feedback, "Published");
		assert.equal((await participant.statuses())[round], "feedback");
	}
	assert.equal((await participant.current({ round: "3" })).submission, null);
});


test("new-round problem statements support upload, publication, preview, and independent replacement", async () => {
	await promoteBoth();
	const statements = roundProblemStatementRouter.createCaller(context());
	const memberStatements = roundProblemStatementRouter.createCaller(context("member@example.com", "member"));
	const outsider = roundProblemStatementRouter.createCaller(context("outsider@example.com", "outsider"));
	for (const round of ["4", "5"] as const) {
		const file = { round, filename: `${round}-statement.pdf`, mimeType: "application/pdf" as const, fileSize: 42 };
		const upload = await statements.createUploadUrl(file);
		await statements.replace({ ...file, uploadId: upload.uploadId });
		assert.equal((await statements.adminMetadata())[round]!.originalFilename, file.filename);
		assert.equal(await memberStatements.current({ round }), null);
		await admin.setProblemStatementPublished({ round, isPublished: true });
		assert.equal((await memberStatements.current({ round }))!.originalFilename, file.filename);
		await assert.rejects(outsider.current({ round }), { code: "FORBIDDEN" });
		const replacement = await statements.createUploadUrl(file);
		await statements.replace({ ...file, filename: "replacement.pdf", uploadId: replacement.uploadId });
		assert.equal((await memberStatements.current({ round }))!.originalFilename, "replacement.pdf");
	}
	await statements.remove({ round: "4" });
	assert.equal(await memberStatements.current({ round: "4" }), null);
	assert.equal((await memberStatements.current({ round: "5" }))!.originalFilename, "replacement.pdf");
});


test("PDF and PPTX submissions preserve their format through uploads, replacements, and downloads", async () => {
	await promoteBoth();
	for (const round of ["3", "4", "5"] as const) {
		await admin.setRoundSubmissionOpen({ round, isOpen: true });
		for (const extension of [".pptx", ".pdf", ".pptx"] as const) {
			const file = { round, filename: `Original${extension.toUpperCase()}`, mimeType: roundSubmissionMimeTypes[extension], fileSize: 42 };
			const filename = roundSubmissionFilename("Test Team", round, extension);
			const upload = await teammate.createUploadUrl(file);
			assert.equal(signedCommands.at(-1)!.input.ContentType, file.mimeType);
			assert.ok(signedCommands.at(-1)!.input.Key!.endsWith(`/${upload.uploadId}/${filename}`));
			objectMimeType = "application/octet-stream";
			await assert.rejects(teammate.finalize({ ...file, uploadId: upload.uploadId, description: "" }), { message: "UPLOAD_MISMATCH" });
			objectMimeType = file.mimeType;
			await teammate.finalize({ ...file, uploadId: upload.uploadId, description: "Slides" });
			const current = (await participant.current({ round })).submission!;
			assert.equal(current.originalFilename, filename);
			assert.equal(current.mimeType, file.mimeType);
			await participant.createDownloadUrl({ round });
			assert.ok(signedCommands.at(-1)!.input.Key!.endsWith(`/${filename}`));
			assert.ok(signedCommands.at(-1)!.input.ResponseContentDisposition!.includes(filename));
			const [submission] = await admin.listRoundSubmissions({ round });
			await admin.createRoundDownloadUrl({ round, submissionId: submission!.id });
			assert.ok(signedCommands.at(-1)!.input.ResponseContentDisposition!.includes(filename));
			if (extension === ".pptx") {
				await assert.rejects(participant.createPreviewUrl({ round }), { message: "UNSUPPORTED_PREVIEW" });
				await assert.rejects(admin.createRoundPreviewUrl({ round, submissionId: submission!.id }), { message: "UNSUPPORTED_PREVIEW" });
			}
		}
	}
});

test("submission validation rejects unsupported extensions and mismatched MIME types at both upload stages", async () => {
	await admin.setRoundSubmissionOpen({ round: "3", isOpen: true });
	for (const [filename, mimeType] of [
		["slides.ppt", "application/vnd.ms-powerpoint"],
		["slides.pptm", "application/vnd.ms-powerpoint.presentation.macroEnabled.12"],
		["slides.pptx.exe", roundSubmissionMimeTypes[".pptx"]],
		["slides.pptx", "application/pdf"],
		["slides.pdf", roundSubmissionMimeTypes[".pptx"]],
		["slides.pptx", "application/zip"],
	]) {
		const file = { round: "3" as const, filename: filename!, mimeType: mimeType!, fileSize: 42 };
		await assert.rejects(participant.createUploadUrl(file), { message: "UNSUPPORTED_FILE" });
		await assert.rejects(participant.finalize({ ...file, uploadId: crypto.randomUUID(), description: "" }), { message: "UNSUPPORTED_FILE" });
	}
	for (const round of roundIds) {
		assert.ok(roundSubmissionFilename("Team/A", round, ".pptx").endsWith(".pptx"));
	}
	assert.equal(roundSubmissionExtension("SLIDES.PPTX"), ".pptx");
	assert.equal(roundSubmissionExtension("slides.pptx.exe"), null);
	assert.equal(roundSubmissionExtension("pptx"), null);
});
