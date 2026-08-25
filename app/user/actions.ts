"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { getUserDisplayName } from "@/lib/data/user";
import { requireKinesisUser } from "@/lib/auth";

export type UserFormState = { error?: string; success?: boolean };

export async function updateUserAction(_state: UserFormState, formData: FormData): Promise<UserFormState> {
  const currentUser = await requireKinesisUser();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!firstName || !lastName || !email) return { error: "First name, last name, and email are required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  const user = { firstName, lastName, preferredName: preferredName || null, email };
  const previous = currentUser;
  await prisma.$transaction([
    prisma.user.update({ where: { id: currentUser.id }, data: user }),
    prisma.document.updateMany({ where: { userId: currentUser.id, owner: { in: [getUserDisplayName(previous), "user"] } }, data: { owner: getUserDisplayName(user) } }),
  ]);
  revalidatePath("/", "layout");
  return { success: true };
}
