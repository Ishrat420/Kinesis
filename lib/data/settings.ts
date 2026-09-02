import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from "@/lib/format/preferences";
import { REMINDER_LEAD_DEFAULTS } from "@/lib/reminders/policy";

export const defaultSettings = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  notificationsEnabled: true,
  remindersEnabled: true,
  milestoneReminderLeadDays: REMINDER_LEAD_DEFAULTS.milestone,
  relationshipReminderLeadDays: REMINDER_LEAD_DEFAULTS.relationship,
  customItemReminderLeadDays: REMINDER_LEAD_DEFAULTS.customItem,
};

export async function getSettings() {
  const user = await requireKinesisUser();
  return (await prisma.userSettings.findUnique({ where: { userId: user.id } })) ?? { ...defaultSettings, userId: user.id };
}
