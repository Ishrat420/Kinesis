import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);
const isCronRoute = createRouteMatcher(["/api/notifications/evaluate"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);
const frontendApiProxyEnabled = process.env.CLERK_FRONTEND_API_PROXY_ENABLED === "true";

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublicRoute(request) || isCronRoute(request)) return;

    const { userId } = await auth();
    if (!userId) {
      if (!isApiRoute(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const configuredOwner = process.env.KINESIS_OWNER_CLERK_USER_ID?.trim();

    if (!configuredOwner) return new NextResponse("Kinesis owner authentication is not configured.", { status: 503 });
    if (userId !== configuredOwner) return new NextResponse("Forbidden", { status: 403 });
  },
  {
    frontendApiProxy: { enabled: frontendApiProxyEnabled },
  },
);

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Match Clerk Frontend API proxy requests when the Clerk option above is enabled.
    // Matcher values must remain static so Next.js can analyze them at build time.
    '/__clerk/(.*)',
  ],
};
