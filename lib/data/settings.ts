import { prisma } from "./prisma";
import { requireKinesisUser } from "@/lib/auth";
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from "@/lib/format/preferences";
import { REMINDER_LEAD_DEFAULTS } from "@/lib/reminders/policy";
import { OVERDUE_REMINDER_INTERVAL } from "@/lib/push/overdue-reminder";

export const defaultSettings = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  timeZone: DEFAULT_TIME_ZONE,
  notificationsEnabled: true,
  remindersEnabled: true,
  milestoneReminderLeadDays: REMINDER_LEAD_DEFAULTS.milestone,
  relationshipReminderLeadDays: REMINDER_LEAD_DEFAULTS.relationship,
  customItemReminderLeadDays: REMINDER_LEAD_DEFAULTS.customItem,
  todoReminderLeadDays: REMINDER_LEAD_DEFAULTS.todo,
  overdueRemindersEnabled: true,
  overdueReminderIntervalDays: OVERDUE_REMINDER_INTERVAL.default,
  overdueReminderLastSentOn: null as Date | null,
  dashboardModuleOrder: [] as string[],
};

export async function getSettings() {
  const user = await requireKinesisUser();
  return (await prisma.userSettings.findUnique({ where: { userId: user.id } })) ?? { ...defaultSettings, userId: user.id };
}
