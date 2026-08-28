import "server-only";

import { auth, currentUser, reverificationError, reverificationErrorResponse } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@/lib/data/prisma";

function getConfiguredOwnerId() {
  const ownerId = process.env.KINESIS_OWNER_CLERK_USER_ID?.trim();
  if (!ownerId) {
    throw new Error("Kinesis owner authentication is not configured.");
  }
  return ownerId;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

export const requireKinesisUser = cache(async () => {
  const clerkUser = await getAuthenticatedClerkUser();
  const clerkUserId = clerkUser.id;
  const isConfiguredOwner = clerkUserId === getConfiguredOwnerId();

  const email = clerkUser.primaryEmailAddress?.emailAddress.trim();
  if (!email) throw new Error("A primary email address is required for Kinesis.");

  const firstName = clerkUser.firstName?.trim() || email.split("@")[0] || "Kinesis";
  const lastName = clerkUser.lastName?.trim() || "Owner";

  const mapped = await prisma.user.findUnique({ where: { clerkUserId } });
  if (mapped) {
    if (mapped.status !== "ACTIVE") throw new Error("Unauthorized");
    if (mapped.email === email && mapped.firstName === firstName && mapped.lastName === lastName) return mapped;
    const previousDisplayName = mapped.preferredName?.trim() || mapped.firstName;
    const nextDisplayName = mapped.preferredName?.trim() || firstName;
    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: mapped.id }, data: { email, firstName, lastName } }),
      prisma.document.updateMany({ where: { userId: mapped.id, owner: { in: [previousDisplayName, "user"] } }, data: { owner: nextDisplayName } }),
    ]);
    return updated;
  }

  return prisma.$transaction(async (tx) => {
    // Serialize provisioning attempts for this Clerk identity. React's cache only
    // deduplicates work within one render/request, so two first requests can
    // otherwise both observe an empty User table.
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", clerkUserId);

    const concurrentlyMapped = await tx.user.findUnique({ where: { clerkUserId } });
    if (concurrentlyMapped) return concurrentlyMapped;

    if (!isConfiguredOwner) {
      const invitation = await tx.userInvitation.findUnique({ where: { email: normalizeEmail(email) } });
      if (!invitation || invitation.revokedAt || invitation.acceptedAt) throw new Error("Unauthorized");

      const member = await tx.user.create({ data: { clerkUserId, firstName, lastName, email, role: "MEMBER" } });
      await tx.userInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      return member;
    }

    const existingOwners = await tx.user.findMany({ where: { role: "OWNER" }, orderBy: { createdAt: "asc" }, take: 2 });
    if (existingOwners.length > 1) throw new Error("This Kinesis deployment contains multiple owners.");

    let existingOwner = existingOwners[0];
    if (!existingOwner) {
      const unmappedUsers = await tx.user.findMany({ where: { clerkUserId: null }, orderBy: { createdAt: "asc" }, take: 2 });
      if (unmappedUsers.length > 1) throw new Error("This Kinesis deployment contains multiple users awaiting owner assignment.");
      existingOwner = unmappedUsers[0];
    }
    const owner = existingOwner
      ? await tx.user.update({ where: { id: existingOwner.id }, data: { clerkUserId, firstName, lastName, email, role: "OWNER", status: "ACTIVE" } })
      : await tx.user.create({ data: { clerkUserId, firstName, lastName, email, role: "OWNER" } });

    if (existingOwner) {
      const previousDisplayName = existingOwner.preferredName?.trim() || existingOwner.firstName;
      const nextDisplayName = owner.preferredName?.trim() || owner.firstName;
      if (previousDisplayName !== nextDisplayName) {
        await tx.document.updateMany({
          where: { userId: owner.id, owner: { in: [previousDisplayName, "user"] } },
          data: { owner: nextDisplayName },
        });
      }
    }

    return owner;
  });
});

export async function requireKinesisOwner() {
  const user = await requireKinesisUser();
  if (user.role !== "OWNER") throw new Error("Unauthorized");
  return user;
}
