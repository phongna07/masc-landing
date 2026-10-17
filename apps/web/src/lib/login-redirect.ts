import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { loginDestination } from "./login-destination";

export async function redirectToLogin(fallbackDestination: string): Promise<never> {
	const pathname = (await headers()).get("x-masc-pathname");
	const destination = loginDestination(pathname ?? fallbackDestination);
	redirect(`/login?next=${encodeURIComponent(destination)}`);
}
