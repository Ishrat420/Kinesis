import { describe, expect, it } from "vitest";
import { CUSTOM_FIELDS_FORM_KEY, KINESIS_LINK_TARGET_TYPES, kinesisLinkTargetOrder } from "@/lib/custom-fields/types";
import { parseCustomFields } from "@/lib/custom-fields/parse";

describe("Kinesis link targets", () => {
  it("offers only the object types a link can resolve to a page, in picker order", () => {
    expect(KINESIS_LINK_TARGET_TYPES).toEqual(["DOCUMENT", "CUSTOM_ITEM", "GOAL", "FINANCE_ITEM", "PERSON", "TODO"]);
  });

  it("reads picker order from each type's own order, not the allowed-types list's position", () => {
    // Membership and order come from independent properties on the config, so
    // this asserts them separately rather than through one array's shape.
    expect(kinesisLinkTargetOrder("DOCUMENT")).toBeLessThan(kinesisLinkTargetOrder("CUSTOM_ITEM"));
    expect(kinesisLinkTargetOrder("CUSTOM_ITEM")).toBeLessThan(kinesisLinkTargetOrder("GOAL"));
    expect(kinesisLinkTargetOrder("GOAL")).toBeLessThan(kinesisLinkTargetOrder("FINANCE_ITEM"));
    expect(kinesisLinkTargetOrder("FINANCE_ITEM")).toBeLessThan(kinesisLinkTargetOrder("PERSON"));
    expect(kinesisLinkTargetOrder("PERSON")).toBeLessThan(kinesisLinkTargetOrder("TODO"));
  });
});

const payload = (fields: Array<Record<string, unknown>>) => {
  const data = new FormData();
  data.set(CUSTOM_FIELDS_FORM_KEY, JSON.stringify(fields));
  return data;
};

/**
 * A Kinesis Link field's targets are cleared, not the field itself, when
 * every object they pointed at is deleted -- FieldLink cascades per target,
 * the ObjectField row stays. `parseCustomFields` used to require a target on
 * every save regardless, which meant a field broken by someone else's delete
 * blocked every other edit on the form until it was personally repaired.
 * Only a field with no saved id -- one actually being added in this edit --
 * still has to be pointed at something before it can be saved.
 */
describe("parseCustomFields", () => {
  it("requires a target for a brand-new Kinesis Link field", () => {
    expect(parseCustomFields(payload([{ label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [] }])))
      .toEqual({ ok: false, error: "Choose what “Related goal” links to." });
  });

  it("does not require a target for an existing Kinesis Link field whose targets were cleared elsewhere", () => {
    expect(parseCustomFields(payload([{ id: "field-1", label: "Related goal", type: "KINESIS_LINK", targetObjectIds: [] }])))
      .toEqual({ ok: true, fields: [{ id: "field-1", label: "Related goal", value: "", type: "KINESIS_LINK", targetObjectIds: [] }] });
  });

  it("keeps a chosen target regardless of whether the field is new or existing", () => {
    expect(parseCustomFields(payload([{ label: "Related goal", type: "KINESIS_LINK", targetObjectIds: ["goal-1"] }])))
      .toEqual({ ok: true, fields: [{ id: undefined, label: "Related goal", value: "", type: "KINESIS_LINK", targetObjectIds: ["goal-1"] }] });
  });
});
