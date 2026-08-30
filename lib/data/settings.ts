import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/format/preferences";

export const defaultSettings = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  notificationsEnabled: true,
  remindersEnabled: true,
};

export async function getSettings() {
  const user = await requireKinesisUser();
  return (await prisma.userSettings.findUnique({ where: { userId: user.id } })) ?? { ...defaultSettings, userId: user.id };
}
