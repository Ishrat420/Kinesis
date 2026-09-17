import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/server", () => ({ connection: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { updateDocument } from "@/lib/data/documents";
import { refusalOf } from "@/lib/actions/refusal";

/**
 * The picker (getKinesisLinkOptions, given the record's own object id to
 * exclude) already keeps a document from offering itself as a link target,
 * but that is a client-side courtesy, not the enforcement -- a stale tab, or
 * a request built by hand, could still submit one. This is that enforcement,
 * run against a real database since the check reads the document's own
 * `objectId` from the row `updateDocument` is already writing.
 */

const owner = "self-link-document-owner";
const asOwner = () => mocks.requireKinesisUser.mockResolvedValue({ id: owner });

async function makeDocument() {
  await prisma.object.create({ data: { id: "self-link-doc-object", type: "DOCUMENT", userId: owner, name: "Passport" } });
  return prisma.document.create({
    data: { id: "self-link-doc", objectId: "self-link-doc-object", userId: owner, name: "Passport", type: "Passport", status: "Active", owner: "Owner" },
  });
}

describe.sequential("updateDocument: refuses linking a document to itself", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    asOwner();
    await prisma.user.deleteMany({ where: { id: owner } });
    await prisma.user.create({ data: { id: owner, firstName: "Self", lastName: "Link", email: "self-link-document-owner@example.test" } });
  });
  afterAll(async () => { await prisma.user.deleteMany({ where: { id: owner } }); await prisma.$disconnect(); });

  it("refuses a Kinesis Link field pointed at the document's own object, and writes nothing", async () => {
    const document = await makeDocument();

    const error = await updateDocument(document.id, {
      name: "Passport", type: "Passport", status: "Active",
      customFields: [{ label: "Related", type: "KINESIS_LINK", value: "", targetObjectIds: ["self-link-doc-object"] }],
    }, document.updatedAt).catch((thrown) => thrown);

    expect(refusalOf(error)).toBe("A document can't be linked to itself.");
    expect(await prisma.objectField.findMany({ where: { objectId: "self-link-doc-object" } })).toHaveLength(0);
  });

  it("still allows linking to a different document", async () => {
    const document = await makeDocument();
    await prisma.object.create({ data: { id: "self-link-other-object", type: "DOCUMENT", userId: owner, name: "Visa" } });
    await prisma.document.create({ data: { id: "self-link-other-doc", objectId: "self-link-other-object", userId: owner, name: "Visa", type: "Visa", status: "Active", owner: "Owner" } });

    const result = await updateDocument(document.id, {
      name: "Passport", type: "Passport", status: "Active",
      customFields: [{ label: "Related", type: "KINESIS_LINK", value: "", targetObjectIds: ["self-link-other-object"] }],
    }, document.updatedAt);

    expect(result.name).toBe("Passport");
    const [field] = await prisma.objectField.findMany({ where: { objectId: "self-link-doc-object" }, include: { links: true } });
    expect(field.links.map((link) => link.targetObjectId)).toEqual(["self-link-other-object"]);
  });
});
