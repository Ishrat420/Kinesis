"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisOwner, requireRecentVerification } from "@/lib/auth";

export type UserManagementState = { error?: string; message?: string };

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function inviteUserAction(
  _state: UserManagementState,
  formData: FormData,
): Promise<UserManagementState> {
  const owner = await requireKinesisOwner();
  const email = normalizeEmail(formData.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (existingUser) return { error: "That email already belongs to a Kinesis user." };

  const existingInvitation = await prisma.userInvitation.findUnique({ where: { email } });
  if (existingInvitation && !existingInvitation.revokedAt && !existingInvitation.acceptedAt) {
    return { error: "That email already has a pending invitation." };
  }

  const client = await clerkClient();
  let invitation: Awaited<ReturnType<typeof client.invitations.createInvitation>>;
  try {
    invitation = await client.invitations.createInvitation({
      emailAddress: email,
      notify: true,
      publicMetadata: { kinesisInvitation: true },
    });
  } catch {
    return { error: "Clerk could not send this invitation. Check whether the address already exists or was invited." };
  }

  try {
    await prisma.userInvitation.upsert({
      where: { email },
      create: { email, clerkInvitationId: invitation.id, invitedById: owner.id },
      update: { clerkInvitationId: invitation.id, invitedById: owner.id, acceptedAt: null, revokedAt: null },
    });
  } catch (error) {
    await client.invitations.revokeInvitation(invitation.id).catch(() => undefined);
    throw error;
  }

  revalidatePath("/settings");
  return { message: `Invitation sent to ${email}.` };
}

export async function revokeInvitationAction(invitationId: string) {
  await requireKinesisOwner();
  const invitation = await prisma.userInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt) return;

  const client = await clerkClient();
  await client.invitations.revokeInvitation(invitation.clerkInvitationId);
  await prisma.userInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
  revalidatePath("/settings");
}

export async function setUserAccessAction(userId: string, enabled: boolean) {
  const verification = await requireRecentVerification();
  if (verification !== true) return verification;
  const owner = await requireKinesisOwner();
  if (userId === owner.id) return { error: "The deployment owner cannot be disabled." };

  await prisma.user.updateMany({
    where: { id: userId, role: "MEMBER" },
    data: { status: enabled ? "ACTIVE" : "REVOKED" },
  });
  revalidatePath("/settings");
  return { success: true };
}
