import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@/lib/data/prisma";

const OWNER_ID = "current";

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
  const email = clerkUser.primaryEmailAddress?.emailAddress.trim();
  if (!email) throw new Error("A primary email address is required for Kinesis.");

  const firstName = clerkUser.firstName?.trim() || email.split("@")[0] || "Kinesis";
  const lastName = clerkUser.lastName?.trim() || "Owner";

  const mapped = await prisma.user.findUnique({ where: { clerkUserId } });
  if (mapped) {
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
    const owner = await tx.user.upsert({
      where: { id: OWNER_ID },
      create: { id: OWNER_ID, clerkUserId, firstName, lastName, email },
      update: {},
    });

    if (owner.clerkUserId && owner.clerkUserId !== clerkUserId) {
      throw new Error("This Kinesis instance already has an owner.");
    }

    const claimed = await tx.user.updateMany({
      where: { id: owner.id, clerkUserId: null },
      data: { clerkUserId },
    });
    if (!claimed.count && owner.clerkUserId !== clerkUserId) {
      throw new Error("This Kinesis instance already has an owner.");
    }

    return tx.user.findUniqueOrThrow({ where: { id: owner.id } });
  });
});
