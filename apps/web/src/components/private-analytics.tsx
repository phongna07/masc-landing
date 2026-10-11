"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";

export default function PrivateAnalytics() {
	const pathname = usePathname();
	if (["/tickets", "/my-tickets", "/admin", "/login"].some(prefix => pathname.startsWith(prefix))) return null;
	return <Analytics beforeSend={event => {
		const url = new URL(event.url);
		if (["/tickets", "/my-tickets", "/admin", "/login"].some(prefix => url.pathname.startsWith(prefix)) || /[A-HJ-NP-Z2-9]{20}/i.test(url.pathname)) return null;
		url.search = "";
		url.hash = "";
		return { ...event, url: url.toString() };
	}} />;
}
