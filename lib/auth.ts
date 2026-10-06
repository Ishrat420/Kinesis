import "server-only";

import { auth, currentUser, reverificationError, reverificationErrorResponse } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@/lib/data/prisma";
import { ensureStarterTemplate } from "@/lib/data/starter-template";

/**
 * The deployment's one admin: the Clerk identity in KINESIS_OWNER_CLERK_USER_ID,
 * the only person who may invite others (ADR-014). It doesn't decide who may
 * sign in -- every signed-in user gets their own account -- and leaving it
 * unset just means nobody is admin.
 */
function getAdminClerkUserId() {
  return process.env.KINESIS_OWNER_CLERK_USER_ID?.trim() || null;
}

/** Whether this Clerk identity is the deployment's admin. */
export function isKinesisAdmin(clerkUserId: string) {
  const adminId = getAdminClerkUserId();
  return adminId !== null && clerkUserId === adminId;
}

export const SENSITIVE_OPERATION_REVERIFICATION = {
  level: "first_factor",
  afterMinutes: 10,
} as const;

export async function requireRecentVerification() {
  const authState = await auth();
  if (!authState.userId) throw new Error("Unauthenticated");
  if (authState.has({ reverification: SENSITIVE_OPERATION_REVERIFICATION })) return true;
  return reverificationError(SENSITIVE_OPERATION_REVERIFICATION);
}

export async function requireRecentVerificationResponse() {
  const verification = await requireRecentVerification();
  return verification === true ? true : reverificationErrorResponse(SENSITIVE_OPERATION_REVERIFICATION);
}

export const getAuthenticatedClerkUser = cache(async () => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthenticated");

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkUserId) throw new Error("Unauthenticated");
  return clerkUser;
});

/**
 * The signed-in person's own Kinesis account, created on their first sign-in.
 * Anyone signed in to Clerk gets one; who can sign in is Clerk's call
 * (Restricted sign-up mode, by invitation).
 */
export const requireKinesisUser = cache(async () => {
  const clerkUser = await getAuthenticatedClerkUser();
  const clerkUserId = clerkUser.id;

  const email = clerkUser.primaryEmailAddress?.emailAddress.trim();
  if (!email) throw new Error("A primary email address is required for Kinesis.");

  const firstName = clerkUser.firstName?.trim() || email.split("@")[0] || "Kinesis";
  const lastName = clerkUser.lastName?.trim() || "Owner";

  const mapped = await prisma.user.findUnique({ where: { clerkUserId } });
  if (mapped) {
    if (mapped.email === email && mapped.firstName === firstName && mapped.lastName === lastName) {
      await ensureStarterTemplate(prisma, mapped.id);
      return mapped;
    }
    const previousDisplayName = mapped.preferredName?.trim() || mapped.firstName;
    const nextDisplayName = mapped.preferredName?.trim() || firstName;
    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: mapped.id }, data: { email, firstName, lastName } }),
      prisma.document.updateMany({ where: { userId: mapped.id, owner: { in: [previousDisplayName, "user"] } }, data: { owner: nextDisplayName } }),
    ]);
    await ensureStarterTemplate(prisma, updated.id);
    return updated;
  }

  // A Clerk identity Kinesis hasn't seen before always gets a new, empty
  // account. It never takes over an existing account -- not even when that
  // account is the only one, or has no Clerk identity bound yet. Moving an
  // account to a different Clerk identity (owner rotation) is a deliberate
  // operator step instead: `npm run owner:rebind` (scripts/rebind-owner.mjs).
  return prisma.$transaction(async (tx) => {
    // Serialize provisioning attempts for this Clerk identity. React's cache only
    // deduplicates work within one render/request, so two first requests can
    // otherwise both observe that no account exists yet.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", clerkUserId);

    const concurrentlyMapped = await tx.user.findUnique({ where: { clerkUserId } });
    if (concurrentlyMapped) return concurrentlyMapped;

    const created = await tx.user.create({ data: { clerkUserId, firstName, lastName, email } });
    await ensureStarterTemplate(tx, created.id);
    return created;
  });
});

/** requireKinesisUser, for actions only the admin may take (inviting people). Everyone else is refused. */
export async function requireKinesisAdmin() {
  const user = await requireKinesisUser();
  if (!user.clerkUserId || !isKinesisAdmin(user.clerkUserId)) throw new Error("Forbidden");
  return user;
}
