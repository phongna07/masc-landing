import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	// Overwrite any client-supplied value so layouts receive the actual route.
	requestHeaders.set("x-masc-pathname", request.nextUrl.pathname);

	return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
	matcher: ["/admin/:path*", "/dashboard/:path*"],
};
