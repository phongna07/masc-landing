import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonTransaction } from "drizzle-orm/neon-serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import WebSocket from "ws";
import { env } from "@masc-landing/env/server";
import * as schema from "./schema";

// The HTTP client cannot run interactive transactions. Neon Pool uses WebSockets
// and supports PostgreSQL transactions and row locks on the same connection.
neonConfig.webSocketConstructor = WebSocket;
export type TicketTransaction = NeonTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function ticketTransaction<T>(work: (tx: TicketTransaction) => Promise<T>): Promise<T> {
	const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
	try {
		return await drizzle(pool, { schema }).transaction(work);
	} finally {
		await pool.end();
	}
}
