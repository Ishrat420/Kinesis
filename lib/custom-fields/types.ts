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
 * picker. Every `KinesisObjectType` Kinesis has is offered (KD-034): a
 * field's name carries its meaning, not its type, so there is no principled
 * reason a Document's field could point at a Goal but not a Person or a
 * To-Do. The one exception isn't a narrower target list -- it's To-Do's own
 * picker excluding other To-Dos, which is about not letting a To-Do link to
 * itself or its own kind, not about which types this config allows.
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
  PERSON: { enabled: true, order: 50 },
  TODO: { enabled: true, order: 60 },
} as const;

export type KinesisLinkTargetType = keyof typeof KINESIS_LINK_TARGET_CONFIG;

/** The allowed types, in picker order. Neither reading relies on the other. */
export const KINESIS_LINK_TARGET_TYPES = (Object.keys(KINESIS_LINK_TARGET_CONFIG) as KinesisLinkTargetType[])
  .filter((type) => KINESIS_LINK_TARGET_CONFIG[type].enabled)
  .sort((a, b) => KINESIS_LINK_TARGET_CONFIG[a].order - KINESIS_LINK_TARGET_CONFIG[b].order);

/** A target type's picker position, read from its own `order` rather than inferred from array position. */
export const kinesisLinkTargetOrder = (type: KinesisLinkTargetType) => KINESIS_LINK_TARGET_CONFIG[type].order;

/**
 * A field's name defines the meaning of the relationship; the field may
 * contain one or many linked Objects, of any allowed type (KD-034). There is
 * no per-field cardinality or type restriction: both would need a field
 * *definition* to live on, and Kinesis has none yet (see KD-035).
 */
export type CustomFieldValue = {
  id?: string;
  label: string;
  value: string;
  type?: CustomFieldType;
  /** Empty for a Kinesis Link with nothing chosen yet, ignored for every other type. */
  targetObjectIds?: string[];
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
 * The one form field a custom-fields editor posts under: the whole set of
 * fields, JSON-encoded.
 *
 * Before KD-034 this was five positional `FormData` arrays -- one label, one
 * type, one value, one target per field, joined by array index -- which is
 * what made a field's `targetObjectId` a single nullable column rather than a
 * list: the wire format itself had no way to say "this field, three targets."
 * A single serialised payload has no such limit, and removes the position
 * bookkeeping (and the empty hidden inputs `CustomFieldsEditor` used to emit
 * purely to keep five arrays aligned) along with it. One name is enough for
 * every form -- unlike the old positional names, an opaque JSON payload can't
 * collide with a form's own unrelated fields merely by using a common word.
 */
export const CUSTOM_FIELDS_FORM_KEY = "customFieldsPayload";
