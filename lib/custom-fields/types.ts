export const CUSTOM_FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "LINK", label: "Link" },
  { value: "KINESIS_LINK", label: "Kinesis Link" },
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]["value"];
export type KinesisObjectType = "DOCUMENT" | "CUSTOM_ITEM" | "GOAL" | "FINANCE_ITEM" | "PERSON";
export type CustomFieldValue = {
  id?: string;
  label: string;
  value: string;
  type?: CustomFieldType;
  targetType?: KinesisObjectType | null;
  targetId?: string | null;
};

export type KinesisLinkOption = {
  type: KinesisObjectType;
  id: string;
  module: string;
  name: string;
  href: string;
  icon?: string;
  color?: string;
};

export function parseKinesisTarget(value: string) {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if ((type !== "DOCUMENT" && type !== "CUSTOM_ITEM" && type !== "GOAL") || !id) return null;
  return { targetType: type as KinesisObjectType, targetId: id };
}
