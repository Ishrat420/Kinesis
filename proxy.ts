import { clerkMiddleware, createRouteMatcher, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)"]);
const isCronRoute = createRouteMatcher(["/api/notifications/evaluate"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request) || isCronRoute(request)) return;

  const { userId } = await auth();
  if (!userId) {
    if (!isApiRoute(request)) return NextResponse.redirect(new URL("/sign-in", request.url));
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const ownerId = process.env.KINESIS_OWNER_CLERK_USER_ID?.trim();
  if (!ownerId) return new NextResponse("Kinesis owner authentication is not configured.", { status: 503 });
  if (userId === ownerId) return;

  const mapped = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: { status: true } });
  if (mapped?.status === "ACTIVE") return;

  // A newly invited account has not been mapped locally yet. Permit only a
  // verified Clerk identity whose primary email has a live local invitation;
  // requireKinesisUser performs the same check transactionally before data access.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress.trim().toLowerCase();
  if (email) {
    const invitation = await prisma.userInvitation.findUnique({
      where: { email },
      select: { acceptedAt: true, revokedAt: true },
    });
    if (invitation && !invitation.acceptedAt && !invitation.revokedAt) return;
  }

  return new NextResponse("Forbidden", { status: 403 });
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
