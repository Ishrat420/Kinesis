import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);
// Called by Vercel Cron, which has no Clerk session: each route under here
// authenticates the request itself with CRON_SECRET.
const isCronRoute = createRouteMatcher(["/api/cron(.*)"]);
const frontendApiProxyEnabled = process.env.CLERK_FRONTEND_API_PROXY_ENABLED === "true";

export default clerkMiddleware(
  async (auth, request) => {
    if (isPublicRoute(request) || isCronRoute(request)) return;

    // Any signed-in Clerk user is let through: each gets their own private
    // account (ADR-014). Who can sign in at all is decided in Clerk, which
    // must run in Restricted sign-up mode so accounts exist only by
    // invitation -- see docs/security/clerk-configuration.md.
    const { userId } = await auth();
    if (!userId) {
      if (!isApiRoute(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
      return new NextResponse("Unauthorized", { status: 401 });
    }
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
