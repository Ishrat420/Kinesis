import { prisma } from "./prisma";

export const CURRENT_SETTINGS_ID = "current";

export const defaultSettings = {
  id: CURRENT_SETTINGS_ID,
  appearance: "system",
  notificationsEnabled: true,
  remindersEnabled: true,
};

export async function getSettings() {
  return (await prisma.userSettings.findUnique({ where: { id: CURRENT_SETTINGS_ID } })) ?? defaultSettings;
}
