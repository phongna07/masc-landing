import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

const envPath = fileURLToPath(
	new URL("../../../apps/web/.env", import.meta.url),
);
const envResult = dotenv.config({ path: envPath, quiet: true });

if (envResult.error) {
	throw new Error(`Could not load ${envPath}`, { cause: envResult.error });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error(`DATABASE_URL is missing from ${envPath}`);
}

const db = drizzle(neon(databaseUrl));
const result = await db.execute(
	sql`SELECT 1 AS ok, current_database() AS database, current_user AS user`,
);

console.log("Database connection successful:", result.rows[0]);
