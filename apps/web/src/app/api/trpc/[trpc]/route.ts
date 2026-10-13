import { createContext } from "@masc-landing/api/context";
import { appRouter } from "@masc-landing/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handler(req: NextRequest) {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
  });
  if (req.nextUrl.pathname.includes("tickets.")) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}
export { handler as GET, handler as POST };
