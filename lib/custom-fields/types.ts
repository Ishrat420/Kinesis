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
 * Which kinds of object a Kinesis Link offers, and where each sits in the
 * picker. Narrower than the Object types Kinesis stores: every record has an
 * identity, but only these are worth pointing a field at today.
 *
 * `enabled` and `order` are deliberately separate properties rather than one
 * array whose membership means "allowed" and whose position means "display
 * order" -- those are two different questions, and a reorder for display
 * should never be able to silently change which types a link may target.
 */
const KINESIS_LINK_TARGET_CONFIG = {
  DOCUMENT: { enabled: true, order: 10 },
  CUSTOM_ITEM: { enabled: true, order: 20 },
  GOAL: { enabled: true, order: 30 },
  FINANCE_ITEM: { enabled: true, order: 40 },
} as const;

export type KinesisLinkTargetType = keyof typeof KINESIS_LINK_TARGET_CONFIG;

/** The allowed types, in picker order. Neither reading relies on the other. */
export const KINESIS_LINK_TARGET_TYPES = (Object.keys(KINESIS_LINK_TARGET_CONFIG) as KinesisLinkTargetType[])
  .filter((type) => KINESIS_LINK_TARGET_CONFIG[type].enabled)
  .sort((a, b) => KINESIS_LINK_TARGET_CONFIG[a].order - KINESIS_LINK_TARGET_CONFIG[b].order);

/** A target type's picker position, read from its own `order` rather than inferred from array position. */
export const kinesisLinkTargetOrder = (type: KinesisLinkTargetType) => KINESIS_LINK_TARGET_CONFIG[type].order;

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

/**
 * The five positional `FormData` arrays a custom-fields editor posts under,
 * and the one place that naming lives -- so the editor's `<input name=...>`
 * and the server's `formData.getAll(...)` can never drift apart, and a form
 * that already uses its own field names (Documents' `customLabel` etc., kept
 * distinct from its other fields) still decodes through the same parser as
 * everything else.
 */
export type FieldNames = { id: string; label: string; type: string; value: string; target: string };

/** Used wherever a form's custom fields are the only positional fields on it (custom items, Goals). */
export const DEFAULT_FIELD_NAMES: FieldNames = {
  id: "fieldId", label: "fieldLabel", type: "fieldType", value: "fieldValue", target: "fieldTarget",
};

/** Documents already have their own `link`, `notes`, etc.; these keep custom fields from colliding with them. */
export const DOCUMENT_FIELD_NAMES: FieldNames = {
  id: "customId", label: "customLabel", type: "customType", value: "customValue", target: "customTarget",
};
