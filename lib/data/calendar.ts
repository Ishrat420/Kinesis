import { connection } from "next/server";
import { requireKinesisUser } from "@/lib/auth";
import { occurrencesForCadence } from "@/lib/calendar/recurrence";
import { resolveDatedFields } from "@/lib/calendar/dated-fields";
import { reminderOpensAt, reminderPinDetail, reminderPinTitle, type ReminderLead } from "@/lib/calendar/reminders";
import type { KinesisCalendarItem } from "@/lib/calendar/types";
import { addUtcDays } from "@/lib/dates";
import { resolveFormatPreferences } from "@/lib/format/preferences";
import { getReminderLeadDays } from "@/lib/reminders/policy";
import { effectiveStatus } from "@/lib/goals/format";
import { occurrencesInRange } from "@/lib/relationships/occurrence";
import { isOpenTodoStatus } from "@/lib/todos/status";
import { prisma } from "./prisma";

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const timeValue = (date: Date) => date.toISOString().slice(11, 16);
const hasTime = (date: Date) => date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;

/**
 * Everything the calendar needs to pin one reminder: the deadline it warns
 * about and how the lead-up to that deadline is measured.
 */
type ReminderPin = {
  id: string;
  name: string;
  deadline: Date;
  /** The verb the deadline is stated with -- "expires 1 July 2026", "due 1 July 2026". */
  deadlineLabel: string;
  lead: ReminderLead;
  sourceObjectId: string;
  sourceModule?: string;
  href: string;
};

export async function getCalendarItems(start: Date, end: Date): Promise<KinesisCalendarItem[]> {
  await connection();
  const user = await requireKinesisUser();
  const dateFields = { where: { type: "DATE" as const }, select: { id: true, label: true, value: true, type: true } } as const;
  const [settings, goals, documents, importantDates, practices, customItems, todos] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.goal.findMany({ where: { userId: user.id }, include: { milestones: true } }),
    prisma.document.findMany({ where: { userId: user.id, archived: false }, select: { id: true, name: true, type: true, expiryDate: true, prompt: true, customFields: dateFields } }),
    prisma.relationshipImportantDate.findMany({ where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] } }),
    prisma.connectionPractice.findMany({ where: { OR: [{ relationship: { userId: user.id } }, { selfPerson: { userId: user.id } }] }, include: { relationship: { include: { firstPerson: true, secondPerson: true } }, selfPerson: true } }),
    prisma.customItem.findMany({ where: { archived: false, module: { userId: user.id } }, include: { module: true, fields: dateFields } }),
    prisma.todo.findMany({ where: { userId: user.id, dueDate: { not: null } }, select: { id: true, name: true, dueDate: true, status: true } }),
  ]);

  const now = new Date();
  const { locale } = resolveFormatPreferences(settings);
  // A pin marks the day a lead-up opens, which is a fact about the record and
  // stays true however the person chooses to be told. Only Reminders governs
  // it: In-app notifications decides whether the bell speaks, not whether the
  // reminder exists, so it has no say over the calendar.
  const remindersOn = settings?.remindersEnabled ?? true;
  const relationshipLeadDays = getReminderLeadDays(settings, "relationship");
  const milestoneLead: ReminderLead = { kind: "leadDays", days: getReminderLeadDays(settings, "milestone") };
  const relationshipLead: ReminderLead = { kind: "leadDays", days: relationshipLeadDays };
  const customItemLead: ReminderLead = { kind: "leadDays", days: getReminderLeadDays(settings, "customItem") };

  const items: KinesisCalendarItem[] = [];
  const add = (item: Omit<KinesisCalendarItem, "date"> & { date: Date }) => {
    if (item.date >= start && item.date <= end) items.push({ ...item, date: dateKey(item.date) });
  };
  /**
   * Pins the day a lead-up opens, derived from the record rather than read
   * from a notification row. A reminder date is always a whole UTC day, so a
   * pin is always DATED; and it is window-tested on the pin's own date, which
   * can fall inside the month while the deadline it warns about sits outside.
   */
  const addReminder = (pin: ReminderPin) => {
    if (!remindersOn) return;
    add({
      id: pin.id,
      title: reminderPinTitle(pin.name),
      kind: "DATED",
      date: reminderOpensAt(pin.deadline, pin.lead),
      sourceType: "REMINDER",
      sourceObjectId: pin.sourceObjectId,
      sourceModule: pin.sourceModule,
      href: pin.href,
      detail: reminderPinDetail(pin.name, pin.deadlineLabel, pin.deadline, locale),
    });
  };

  for (const goal of goals) {
    if (goal.targetDate) add({ id: `goal-${goal.id}`, title: `${goal.name} target`, kind: "DATED", date: goal.targetDate, sourceType: "GOAL", sourceObjectId: goal.id, sourceModule: "Goals", href: `/goals/${goal.id}`, detail: "Goal target date" });
    for (const milestone of goal.milestones) {
      if (!milestone.dueDate) continue;
      add({ id: `milestone-${milestone.id}`, title: `${milestone.name} due`, kind: "DATED", date: milestone.dueDate, sourceType: "MILESTONE", sourceObjectId: goal.id, sourceModule: goal.name, href: `/goals/${goal.id}`, detail: milestone.completed ? "Completed milestone" : "Milestone due date" });
      // The engine reconciles away a completed milestone's reminder, and one on
      // a goal that is no longer active, so neither has a lead-up left to pin.
      // The goal's stored status can still say Active after its target date has
      // passed, so the same rule the engine filters by is applied here rather
      // than the column, or the calendar would pin a reminder nothing raises.
      if (milestone.completed || effectiveStatus(goal.status, goal.targetDate, now) !== "Active") continue;
      addReminder({ id: `milestone-reminder-${milestone.id}`, name: milestone.name, deadline: milestone.dueDate, deadlineLabel: "due", lead: milestoneLead, sourceObjectId: goal.id, sourceModule: goal.name, href: `/goals/${goal.id}` });
    }
  }
  for (const document of documents) {
    if (document.expiryDate) {
      add({ id: `document-${document.id}`, title: `${document.name} expires`, kind: "DATED", date: document.expiryDate, sourceType: "DOCUMENT", sourceObjectId: document.id, sourceModule: document.type, priority: "HIGH", href: `/documents/${document.id}`, detail: "Document expiry date" });
      addReminder({ id: `document-reminder-${document.id}`, name: document.name, deadline: document.expiryDate, deadlineLabel: "expires", lead: { kind: "documentPrompt", prompt: document.prompt }, sourceObjectId: document.id, sourceModule: "Documents", href: `/documents/${document.id}` });
    }
    for (const field of resolveDatedFields(document.customFields)) add({ id: `document-field-${field.id}`, title: `${document.name}: ${field.label}`, kind: "DATED", date: field.date, sourceType: "DOCUMENT", sourceObjectId: document.id, sourceModule: document.type, href: `/documents/${document.id}`, detail: `${field.label} from ${document.name}` });
  }
  for (const important of importantDates) {
    const sourceObjectId = important.relationshipId || important.selfPersonId || important.id;
    // An occurrence just past the window can still open its lead-up inside it,
    // so occurrences are gathered as far ahead as the lead reaches. Both `add`
    // and `addReminder` drop whatever still falls outside.
    for (const occurrence of occurrencesInRange(important, start, addUtcDays(end, relationshipLeadDays))) {
      const year = occurrence.getUTCFullYear();
      add({ id: `relationship-date-${important.id}-${year}`, title: important.label, kind: "DATED", date: occurrence, sourceType: "RELATIONSHIP", sourceObjectId, sourceModule: "Relationships", recurring: important.repeatsYearly, href: "/relationships", detail: important.repeatsYearly ? "Repeats every year" : "Important relationship date" });
      addReminder({ id: `relationship-reminder-${important.id}-${year}`, name: important.label, deadline: occurrence, deadlineLabel: "on", lead: relationshipLead, sourceObjectId, sourceModule: "Relationships", href: "/relationships" });
    }
  }
  for (const practice of practices) {
    const people = practice.relationship ? `${practice.relationship.firstPerson.name} & ${practice.relationship.secondPerson.name}` : practice.selfPerson?.name;
    for (const date of occurrencesForCadence(practice.cadence, practice.createdAt, start, end)) add({ id: `practice-${practice.id}-${dateKey(date)}`, title: practice.title, kind: "SCHEDULED", date, sourceType: "RELATIONSHIP", sourceObjectId: practice.relationshipId || practice.selfPersonId || practice.id, sourceModule: people || "Relationships", recurring: true, href: "/relationships", detail: practice.cadence || "Recurring relationship practice" });
  }
  for (const custom of customItems) {
    const itemHref = `/custom-modules/${custom.moduleId}/items/${custom.id}`;
    if (custom.dueDate) {
      add({ id: `custom-due-${custom.id}`, title: `${custom.name} due`, kind: hasTime(custom.dueDate) ? "SCHEDULED" : "DATED", date: custom.dueDate, startTime: hasTime(custom.dueDate) ? timeValue(custom.dueDate) : undefined, sourceType: "CUSTOM_OBJECT", sourceObjectId: custom.id, sourceModule: custom.module.name, href: itemHref, detail: "Custom item due date" });
      addReminder({ id: `custom-reminder-${custom.id}`, name: custom.name, deadline: custom.dueDate, deadlineLabel: "due", lead: customItemLead, sourceObjectId: custom.id, sourceModule: custom.module.name, href: itemHref });
    }
    for (const field of resolveDatedFields(custom.fields)) add({ id: `custom-field-${field.id}`, title: `${custom.name}: ${field.label}`, kind: "DATED", date: field.date, sourceType: "CUSTOM_OBJECT", sourceObjectId: custom.id, sourceModule: custom.module.name, href: itemHref, detail: `${field.label} from ${custom.module.name}` });
  }
  // A dated To-Do pins its deadline like any other, and keeps it once done --
  // the calendar is a record of when things fell due, so a finished item is
  // relabelled rather than removed, exactly as a completed milestone is. There
  // is no lead-up pin to go with it: a To-Do has no reminder window at all (see
  // getTodoNotificationCandidate), so there is no earlier day to promise.
  for (const todo of todos) {
    if (!todo.dueDate) continue;
    add({ id: `todo-due-${todo.id}`, title: `${todo.name} due`, kind: hasTime(todo.dueDate) ? "SCHEDULED" : "DATED", date: todo.dueDate, startTime: hasTime(todo.dueDate) ? timeValue(todo.dueDate) : undefined, sourceType: "TODO", sourceObjectId: todo.id, sourceModule: "To-Dos", href: `/todos#todo-${todo.id}`, detail: isOpenTodoStatus(todo.status) ? "To-do due date" : "Completed to-do" });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "").localeCompare(b.startTime || "") || a.title.localeCompare(b.title));
}
