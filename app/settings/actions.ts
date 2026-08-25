"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/data/prisma";
import { requireKinesisUser } from "@/lib/auth";

export type SettingsActionState = { error?: string; message?: string };

export async function updateSettingsAction(
  _state: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireKinesisUser();
  const appearance = String(formData.get("appearance") ?? "system");

  if (!["light", "dark", "system"].includes(appearance)) return { error: "Choose a valid appearance." };

  const data = {
    appearance,
    notificationsEnabled: formData.get("notificationsEnabled") === "on",
    remindersEnabled: formData.get("remindersEnabled") === "on",
  };
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  revalidatePath("/settings");
  return { message: "Settings saved." };
}

export async function deleteAllDataAction(): Promise<void> {
  const user = await requireKinesisUser();
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId: user.id } }),
    prisma.attentionDismissal.deleteMany({ where: { userId: user.id } }),
    prisma.document.deleteMany({ where: { userId: user.id } }),
    prisma.documentType.deleteMany({ where: { userId: user.id } }),
    prisma.relationshipGoal.deleteMany({ where: { relationship: { userId: user.id } } }),
    prisma.relationship.deleteMany({ where: { userId: user.id } }),
    prisma.person.deleteMany({ where: { userId: user.id } }),
    prisma.goal.deleteMany({ where: { userId: user.id } }),
    prisma.goalUnit.deleteMany({ where: { userId: user.id } }),
    prisma.customModule.deleteMany({ where: { userId: user.id } }),
    prisma.financeItem.deleteMany({ where: { userId: user.id } }),
    prisma.userSettings.deleteMany({ where: { userId: user.id } }),
    prisma.activityEvent.deleteMany({ where: { userId: user.id } }),
  ]);
  revalidatePath("/", "layout");
}
