export type CalendarItemKind = "DATED" | "SCHEDULED";

export type CalendarSourceType =
  | "GOAL"
  | "MILESTONE"
  | "DOCUMENT"
  | "RELATIONSHIP"
  | "REMINDER"
  | "CUSTOM_OBJECT"
  | "TODO";

export type KinesisCalendarItem = {
  id: string;
  title: string;
  kind: CalendarItemKind;
  date: string;
  startTime?: string;
  endTime?: string;
  sourceType: CalendarSourceType;
  sourceObjectId: string;
  sourceModule?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  recurring?: boolean;
  href: string;
  detail?: string;
};
