export const CUSTOM_FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "CHECKBOX", label: "Checkbox" },
  { value: "LINK", label: "Link" },
  { value: "KINESIS_LINK", label: "Kinesis Link" },
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]["value"];

/**
 * Which kinds of object a Kinesis Link offers. Narrower than the Object types
 * Kinesis stores: every record has an identity, but only these are worth
 * pointing a field at today.
 */
export const KINESIS_LINK_TARGET_TYPES = ["DOCUMENT", "CUSTOM_ITEM", "GOAL"] as const;
export type KinesisLinkTargetType = (typeof KINESIS_LINK_TARGET_TYPES)[number];

export type CustomFieldValue = {
  id?: string;
  label: string;
  value: string;
  type?: CustomFieldType;
  targetObjectId?: string | null;
};

export type KinesisLinkOption = {
  type: KinesisLinkTargetType;
  objectId: string;
  module: string;
  name: string;
  href: string;
  icon?: string;
  color?: string;
};
