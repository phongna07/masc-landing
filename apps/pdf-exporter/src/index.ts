import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createDbForUrl } from "@masc-landing/db/client";
import {
	pdfExportJobs,
	roundOneSubmissions,
	roundOneTeams,
	roundSubmissions,
	roundThreeSubmissions,
	roundThreeTeams,
	roundTwoSubmissions,
	roundTwoTeams,
	teams,
} from "@masc-landing/db/schema/index";
import archiver, { type Archiver } from "archiver";
import { and, asc, eq, getTableName, lt, sql } from "drizzle-orm";
import { createServer } from "node:http";
import { PassThrough, Readable } from "node:stream";

type RoundId = "0.5" | "1" | "2" | "3";

const config = {
	databaseUrl: requiredEnv("DATABASE_URL"),
	r2AccountId: requiredEnv("R2_ACCOUNT_ID"),
	r2AccessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
	r2SecretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
	r2Bucket: requiredEnv("R2_BUCKET"),
	port: integerEnv("PORT", 3001),
	pollIntervalMs: integerEnv("POLL_INTERVAL_MS", 5_000),
	staleAfterMinutes: integerEnv("JOB_STALE_AFTER_MINUTES", 10),
	exportTtlHours: integerEnv("EXPORT_TTL_HOURS", 24),
	maxAttempts: integerEnv("JOB_MAX_ATTEMPTS", 3),
};

const workerId = crypto.randomUUID();
const db = createDbForUrl(config.databaseUrl);
const s3 = new S3Client({
	region: "auto",
	endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: config.r2AccessKeyId,
		secretAccessKey: config.r2SecretAccessKey,
	},
});

let isWorking = false;
let isShuttingDown = false;

const server = createServer((request, response) => {
	if (request.method === "GET" && (request.url === "/" || request.url === "/health")) {
		response.writeHead(200, {
			"access-control-allow-origin": "*",
			"cache-control": "no-store",
			"content-type": "application/json",
		});
		response.end(JSON.stringify({ ok: true, working: isWorking }));
		return;
	}
	response.writeHead(404, { "content-type": "application/json" });
	response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(config.port, "0.0.0.0", () => {
	console.log(`PDF exporter listening on port ${config.port}`);
});

const pollTimer = setInterval(() => void poll(), config.pollIntervalMs);
void poll();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		isShuttingDown = true;
		clearInterval(pollTimer);
		server.close(() => {
			if (!isWorking) process.exit(0);
		});
	});
}

async function poll() {
	if (isWorking || isShuttingDown) return;
	isWorking = true;
	try {
		await failExhaustedJobs();
		await deleteOneExpiredExport();
		const job = await claimNextJob();
		if (job) await processJob(job);
	} catch (error) {
		console.error("PDF exporter poll failed", error);
	} finally {
		isWorking = false;
		if (isShuttingDown) process.exit(0);
	}
}

type ClaimedJob = {
	id: string;
	round: RoundId;
	attemptCount: number;
};

async function claimNextJob(): Promise<ClaimedJob | null> {
	const result = await db.execute(sql`
		with candidate as (
			select id
			from pdf_export_jobs
			where attempt_count < ${config.maxAttempts}
				and (
					status = 'pending'
					or (status = 'processing' and heartbeat_at < now() - (${config.staleAfterMinutes} * interval '1 minute'))
				)
			order by created_at asc
			for update skip locked
			limit 1
		)
		update pdf_export_jobs as job
		set status = 'processing', worker_id = ${workerId}, started_at = now(), heartbeat_at = now(),
			attempt_count = job.attempt_count + 1, error_message = null, updated_at = now()
		from candidate
		where job.id = candidate.id
		returning job.id, job.round, job.attempt_count
	`);
	const row = result.rows[0] as { id: string; round: RoundId; attempt_count: number } | undefined;
	return row ? { id: row.id, round: row.round, attemptCount: Number(row.attempt_count) } : null;
}

async function processJob(job: ClaimedJob) {
	const archiveKey = `pdf-exports/round-${job.round}/${job.id}/${workerId}.zip`;
	const archiveFilename = archiveName(job.round);
	const heartbeatTimer = setInterval(() => {
		void heartbeat(job.id).catch((error) => console.error(`Heartbeat failed for PDF export ${job.id}`, error));
	}, 15_000);

	try {
		const files = await latestPdfSubmissions(job.round);
		if (files.length === 0) {
			await markFailed(job.id, "No PDF submissions were found for this round.");
			return;
		}

		const totalSourceBytes = files.reduce((total, file) => total + file.fileSize, 0);
		const output = new PassThrough();
		const zip = archiver("zip", { zlib: { level: 0 } });
		zip.pipe(output);

		const upload = new Upload({
			client: s3,
			params: {
				Bucket: config.r2Bucket,
				Key: archiveKey,
				Body: output,
				ContentType: "application/zip",
				Metadata: { round: job.round, "job-id": job.id },
			},
			queueSize: 4,
			partSize: 10 * 1024 * 1024,
			leavePartsOnError: false,
		});
		const uploadPromise = upload.done();
		void uploadPromise.catch(() => zip.abort());

		try {
			const usedNames = new Set<string>();
			for (const file of files) {
				const object = await s3.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: file.objectKey }));
				const body = toReadable(object.Body);
				const filename = uniqueEntryName(file.filename, usedNames);
				await appendStream(zip, body, filename);
			}
			await zip.finalize();
			await uploadPromise;
		} catch (error) {
			zip.abort();
			await upload.abort().catch(() => undefined);
			throw error;
		}

		const completedAt = new Date();
		const expiresAt = new Date(completedAt.getTime() + config.exportTtlHours * 60 * 60 * 1_000);
		const [completed] = await db.update(pdfExportJobs).set({
			status: "completed",
			archiveObjectKey: archiveKey,
			archiveFilename,
			fileCount: files.length,
			totalSourceBytes,
			archiveBytes: zip.pointer(),
			completedAt,
			expiresAt,
			heartbeatAt: completedAt,
			updatedAt: completedAt,
		}).where(and(eq(pdfExportJobs.id, job.id), eq(pdfExportJobs.workerId, workerId)))
			.returning({ id: pdfExportJobs.id });

		if (!completed) {
			await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: archiveKey }));
			throw new Error("The export job was claimed by another worker before completion.");
		}
		console.log(`Completed PDF export ${job.id} with ${files.length} files`);
	} catch (error) {
		await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: archiveKey })).catch(() => undefined);
		const message = errorMessage(error);
		await retryOrFail(job, message);
		console.error(`PDF export ${job.id} failed on attempt ${job.attemptCount}`, error);
	} finally {
		clearInterval(heartbeatTimer);
	}
}

async function latestPdfSubmissions(round: RoundId) {
	const { team, submission } = tablesForRound(round);
	const tableName = sql.identifier(getTableName(submission));
	return db.select({
		objectKey: submission.objectKey,
		filename: submission.originalFilename,
		fileSize: submission.fileSize,
		teamName: team.teamName,
	}).from(submission).innerJoin(team, eq(submission.teamId, team.id)).where(and(
		eq(submission.round, round),
		eq(submission.mimeType, "application/pdf"),
		sql`not exists (
			select 1 from ${tableName} as newer_submission
			where newer_submission.team_id = ${submission.teamId}
				and newer_submission.round = ${submission.round}
				and newer_submission.attempt_number > ${submission.attemptNumber}
		)`,
	)).orderBy(asc(team.teamName));
}

function tablesForRound(round: RoundId) {
	if (round === "0.5") return { team: teams, submission: roundSubmissions };
	if (round === "1") return {
		team: roundOneTeams as unknown as typeof teams,
		submission: roundOneSubmissions as unknown as typeof roundSubmissions,
	};
	if (round === "2") return {
		team: roundTwoTeams as unknown as typeof teams,
		submission: roundTwoSubmissions as unknown as typeof roundSubmissions,
	};
	return {
		team: roundThreeTeams as unknown as typeof teams,
		submission: roundThreeSubmissions as unknown as typeof roundSubmissions,
	};
}

async function heartbeat(jobId: string) {
	await db.update(pdfExportJobs).set({ heartbeatAt: new Date(), updatedAt: new Date() })
		.where(and(eq(pdfExportJobs.id, jobId), eq(pdfExportJobs.workerId, workerId),
			eq(pdfExportJobs.status, "processing")));
}

async function retryOrFail(job: ClaimedJob, message: string) {
	const finalAttempt = job.attemptCount >= config.maxAttempts;
	await db.update(pdfExportJobs).set({
		status: finalAttempt ? "failed" : "pending",
		errorMessage: message,
		workerId: null,
		heartbeatAt: null,
		updatedAt: new Date(),
	}).where(and(eq(pdfExportJobs.id, job.id), eq(pdfExportJobs.workerId, workerId)));
}

async function markFailed(jobId: string, message: string) {
	await db.update(pdfExportJobs).set({
		status: "failed",
		errorMessage: message,
		workerId: null,
		heartbeatAt: null,
		updatedAt: new Date(),
	}).where(and(eq(pdfExportJobs.id, jobId), eq(pdfExportJobs.workerId, workerId)));
}

async function failExhaustedJobs() {
	await db.execute(sql`
		update pdf_export_jobs
		set status = 'failed', worker_id = null, heartbeat_at = null,
			error_message = coalesce(error_message, 'The export worker stopped before the job could complete.'),
			updated_at = now()
		where status = 'processing'
			and attempt_count >= ${config.maxAttempts}
			and heartbeat_at < now() - (${config.staleAfterMinutes} * interval '1 minute')
	`);
}

async function deleteOneExpiredExport() {
	const [job] = await db.select({ id: pdfExportJobs.id, objectKey: pdfExportJobs.archiveObjectKey })
		.from(pdfExportJobs).where(and(eq(pdfExportJobs.status, "completed"),
			lt(pdfExportJobs.expiresAt, new Date()))).orderBy(asc(pdfExportJobs.expiresAt)).limit(1);
	if (!job) return;
	if (job.objectKey) {
		await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: job.objectKey }));
	}
	await db.update(pdfExportJobs).set({ status: "expired", archiveObjectKey: null, updatedAt: new Date() })
		.where(and(eq(pdfExportJobs.id, job.id), eq(pdfExportJobs.status, "completed")));
}

function appendStream(zip: Archiver, input: Readable, name: string) {
	return new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			zip.off("entry", onEntry);
			zip.off("error", onError);
			input.off("error", onError);
		};
		const onEntry = (entry: { name: string }) => {
			if (entry.name !== name) return;
			cleanup();
			resolve();
		};
		const onError = (error: Error) => {
			cleanup();
			reject(error);
		};
		zip.on("entry", onEntry);
		zip.on("error", onError);
		input.on("error", onError);
		zip.append(input, { name });
	});
}

function toReadable(body: unknown): Readable {
	if (body instanceof Readable) return body;
	if (body && typeof body === "object" && Symbol.asyncIterator in body) {
		return Readable.from(body as AsyncIterable<Uint8Array>);
	}
	throw new Error("R2 returned an empty or unsupported object body.");
}

function uniqueEntryName(filename: string, usedNames: Set<string>) {
	const safe = filename.trim().replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, "_") || "submission.pdf";
	const extensionIndex = safe.toLowerCase().endsWith(".pdf") ? safe.length - 4 : safe.length;
	const base = safe.slice(0, extensionIndex);
	const extension = safe.slice(extensionIndex) || ".pdf";
	let candidate = `${base}${extension}`;
	let suffix = 2;
	while (usedNames.has(candidate.toLocaleLowerCase("en-US"))) {
		candidate = `${base} (${suffix})${extension}`;
		suffix += 1;
	}
	usedNames.add(candidate.toLocaleLowerCase("en-US"));
	return candidate;
}

function archiveName(round: RoundId) {
	const token: Record<RoundId, string> = {
		"0.5": "Preliminary_Round",
		"1": "Round_1",
		"2": "Round_2",
		"3": "Round_3",
	};
	return `MASC'26_${token[round]}_Submissions.zip`;
}

function requiredEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

function integerEnv(name: string, fallback: number) {
	const raw = process.env[name]?.trim();
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer.`);
	}
	return value;
}

function errorMessage(error: unknown) {
	return (error instanceof Error ? error.message : "Unknown PDF export error").slice(0, 2_000);
}
