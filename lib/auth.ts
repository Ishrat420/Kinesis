import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@/lib/data/prisma";

const OWNER_ID = "current";

function getConfiguredOwnerId() {
  const ownerId = process.env.KINESIS_OWNER_CLERK_USER_ID?.trim();
  if (!ownerId) {
    throw new Error("Kinesis owner authentication is not configured.");
  }
  return ownerId;
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
  if (clerkUserId !== getConfiguredOwnerId()) throw new Error("Unauthorized");

  const email = clerkUser.primaryEmailAddress?.emailAddress.trim();
  if (!email) throw new Error("A primary email address is required for Kinesis.");

  const firstName = clerkUser.firstName?.trim() || email.split("@")[0] || "Kinesis";
  const lastName = clerkUser.lastName?.trim() || "Owner";

  const mapped = await prisma.user.findUnique({ where: { clerkUserId } });
  if (mapped) {
    if (mapped.id !== OWNER_ID) throw new Error("Unauthorized");
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
    const existingOwner = await tx.user.findUnique({ where: { id: OWNER_ID } });
    const owner = await tx.user.upsert({
      where: { id: OWNER_ID },
      create: { id: OWNER_ID, clerkUserId, firstName, lastName, email },
      update: { clerkUserId, firstName, lastName, email },
    });

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
