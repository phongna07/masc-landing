import { getFreshSession, getSession } from "@masc-landing/auth";
import type { NextRequest } from "next/server";

export function createContext(req: NextRequest) {
  let sessionPromise: ReturnType<typeof getSession> | undefined;
  let freshSessionPromise: ReturnType<typeof getFreshSession> | undefined;

  return {
    auth: null,
    headers: req.headers,
    getSession: () => {
      sessionPromise ??= getSession(req.headers);
      return sessionPromise;
    },
    getFreshSession: () => {
      freshSessionPromise ??= getFreshSession(req.headers);
      return freshSessionPromise;
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
