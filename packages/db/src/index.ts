import { env } from "@masc-landing/env/server";

import { createDbForUrl } from "./client";

export { createDbForUrl } from "./client";

export function createDb() {
	return createDbForUrl(env.DATABASE_URL);
}

export const db = createDb();
