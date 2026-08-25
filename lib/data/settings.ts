import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";

export const CURRENT_SETTINGS_ID = "current";

export const defaultSettings = {
  id: CURRENT_SETTINGS_ID,
  appearance: "system",
  notificationsEnabled: true,
  remindersEnabled: true,
};

export async function getSettings() {
  const user = await requireKinesisUser();
  return (await prisma.userSettings.findUnique({ where: { userId: user.id } })) ?? { ...defaultSettings, userId: user.id };
}
