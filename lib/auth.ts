import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { prisma } from "@/lib/data/prisma";

const OWNER_ID = "current";

export const requireKinesisUser = cache(async () => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthenticated");

  const mapped = await prisma.user.findUnique({ where: { clerkUserId } });
  if (mapped) return mapped;

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkUserId) throw new Error("Unauthenticated");
  const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
  const firstName = clerkUser.firstName?.trim() || email.split("@")[0] || "Kinesis";
  const lastName = clerkUser.lastName?.trim() || "Owner";

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
