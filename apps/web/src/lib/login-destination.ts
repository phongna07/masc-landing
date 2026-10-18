import type { Route } from "next";

// Shared by the server redirect, OAuth callback and popup opener.
export function loginDestination(value: unknown): Route {
	if (typeof value !== "string" || value.length > 1000 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/dashboard";
	try {
		const decoded = decodeURIComponent(value);
		if (decoded.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) return "/dashboard";
		const url = new URL(value, "https://internal.invalid");
		const path = new URL(decoded, "https://internal.invalid").pathname;
		if (url.origin !== "https://internal.invalid" || path.startsWith("/login") || path === "/api" || path.startsWith("/api/")) return "/dashboard";
		return `${url.pathname}${url.search}${url.hash}` as Route;
	} catch { return "/dashboard"; }
}
