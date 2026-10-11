import { getFreshServerSession } from "@/lib/server-session";
import { loginDestination } from "@/lib/login-destination";
import GoogleCallbackClient from "./google-callback-client";

export default async function GoogleCallbackPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
	const params = await searchParams;
	const session = await getFreshServerSession();
	return <GoogleCallbackClient next={loginDestination(params.next)} success={Boolean(session?.user) && !params.error} />;
}
