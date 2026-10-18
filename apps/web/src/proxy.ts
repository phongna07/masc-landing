import { env } from "@masc-landing/env/web";
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	if (!env.NEXT_PUBLIC_IS_SELLING_TICKETS_OPENED &&
		["/tickets", "/my-tickets"].some(route => pathname === route || pathname.startsWith(`${route}/`))) {
		return NextResponse.redirect(new URL("/", request.url));
	}

	const requestHeaders = new Headers(request.headers);
	// Overwrite any client-supplied value so layouts receive the actual route.
	requestHeaders.set("x-masc-pathname", request.nextUrl.pathname);

	return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
	matcher: ["/admin/:path*", "/dashboard/:path*", "/tickets/:path*", "/my-tickets/:path*"],
};
