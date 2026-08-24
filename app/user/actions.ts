"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { CURRENT_USER_ID, getUserDisplayName } from "@/lib/data/user";

export type UserFormState = { error?: string; success?: boolean };

export async function updateUserAction(_state: UserFormState, formData: FormData): Promise<UserFormState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!firstName || !lastName || !email) return { error: "First name, last name, and email are required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };

  const user = { firstName, lastName, preferredName: preferredName || null, email };
  const previous = await prisma.user.findUnique({ where: { id: CURRENT_USER_ID } });
  await prisma.$transaction([
    prisma.user.upsert({ where: { id: CURRENT_USER_ID }, create: { id: CURRENT_USER_ID, ...user }, update: user }),
    prisma.document.updateMany({ where: { owner: { in: [previous ? getUserDisplayName(previous) : "Ishrat", "user"] } }, data: { owner: getUserDisplayName(user) } }),
  ]);
  revalidatePath("/", "layout");
  return { success: true };
}
