import { getFreshSession, getSession } from "@masc-landing/auth";
import { headers } from "next/headers";
import { cache } from "react";

export const getServerSession = cache(async () => getSession(await headers()));

export const getFreshServerSession = cache(async () => getFreshSession(await headers()));
