import { auth } from "@masc-landing/auth";
import type { NextRequest } from "next/server";

export async function createContext(req: NextRequest) {
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  return {
    auth: null,
    headers: req.headers,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
