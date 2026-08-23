"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { CURRENT_SETTINGS_ID } from "@/lib/data/settings";

export type SettingsActionState = { error?: string; message?: string };

export async function updateSettingsAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const appearance = String(formData.get("appearance") ?? "system");
  const reminderLeadDays = Number(formData.get("reminderLeadDays") ?? 7);

  if (!["light", "dark", "system"].includes(appearance)) return { error: "Choose a valid appearance." };
  if (!Number.isInteger(reminderLeadDays) || reminderLeadDays < 0 || reminderLeadDays > 365) {
    return { error: "Reminder notice must be between 0 and 365 days." };
  }

  const data = {
    appearance,
    notificationsEnabled: formData.get("notificationsEnabled") === "on",
    remindersEnabled: formData.get("remindersEnabled") === "on",
    reminderLeadDays,
  };
  await prisma.userSettings.upsert({
    where: { id: CURRENT_SETTINGS_ID },
    create: { id: CURRENT_SETTINGS_ID, ...data },
    update: data,
  });
  revalidatePath("/settings");
  return { message: "Settings saved." };
}

export async function deleteAllDataAction(): Promise<void> {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.attentionDismissal.deleteMany(),
    prisma.document.deleteMany(),
    prisma.documentType.deleteMany(),
    prisma.relationshipGoal.deleteMany(),
    prisma.relationship.deleteMany(),
    prisma.person.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.goalUnit.deleteMany(),
    prisma.customModule.deleteMany(),
    prisma.userSettings.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  revalidatePath("/", "layout");
}
