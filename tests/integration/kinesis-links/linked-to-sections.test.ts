import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireKinesisUser: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth", () => ({ requireKinesisUser: mocks.requireKinesisUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/attention/dismissal", () => ({ parseDismissalKey: vi.fn() }));
vi.mock("@/lib/relationships/occurrence", () => ({ getNextOccurrence: vi.fn() }));

import { prisma } from "@/lib/data/prisma";
import { getKinesisLinkSection } from "@/lib/data/object-relationships";
import { addKinesisLinkAction, removeKinesisLinkAction } from "@/app/actions";
import { getPersonKinesisLinksAction } from "@/app/(app)/relationships/actions";

/**
 * Finance Items and People are linked *to* from other records but had no
 * place of their own to show it (KD-023). Their collapsed Kinesis Links
 * sections read the same links from the target's side.
 */

const owner = "linked-to-owner";
const stranger = "linked-to-stranger";

const asUser = (id: string) => mocks.requireKinesisUser.mockResolvedValue({ id });

const link = (objectId: string, targetObjectId: string) => {
  const data = new FormData();
  data.set("targetObjectId", targetObjectId);
  data.set("direction", "SUPPORTS|forward");
  return addKinesisLinkAction(objectId, {}, data);
};

describe.sequential("Kinesis Links on Finance Items and People", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.user.createMany({
      data: [
        { id: owner, firstName: "Linked", lastName: "Owner", email: "linked-to-owner@example.test" },
        { id: stranger, firstName: "Some", lastName: "Stranger", email: "linked-to-stranger@example.test" },
      ],
    });
    await prisma.object.createMany({
      data: [
        { id: "lt-goal-object", type: "GOAL", name: "Emergency fund", userId: owner },
        { id: "lt-finance-object", type: "FINANCE_ITEM", name: "Savings account", userId: owner },
        { id: "lt-person-object", type: "PERSON", name: "Sam", userId: owner },
      ],
    });
    await prisma.goal.create({ data: { id: "lt-goal", name: "Emergency fund", userId: owner, objectId: "lt-goal-object" } });
    await prisma.financeItem.create({ data: { id: "lt-finance", name: "Savings account", kind: "asset", amount: 1000, userId: owner, objectId: "lt-finance-object" } });
    await prisma.person.create({ data: { id: "lt-person", name: "Sam", userId: owner, objectId: "lt-person-object", positionX: 0, positionY: 0, bubbleSize: 84 } });
    asUser(owner);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
    await prisma.$disconnect();
  });

  it("shows a Finance Item the goal that links to it, with the label read from its own side", async () => {
    await link("lt-goal-object", "lt-finance-object");

    const section = await getKinesisLinkSection("lt-finance-object");

    expect(section.links).toHaveLength(1);
    expect(section.links[0]).toMatchObject({ inverse: true, target: { objectId: "lt-goal-object", module: "Goals", href: "/goals/lt-goal" } });
  });

  it("is empty for a Finance Item nothing links to", async () => {
    await expect(getKinesisLinkSection("lt-finance-object")).resolves.toEqual({ links: [], previews: {}, recentEvents: {} });
  });

  it("revalidates the Finance Item's own page when a link to it is removed from there", async () => {
    await link("lt-goal-object", "lt-finance-object");
    const [{ id }] = (await getKinesisLinkSection("lt-finance-object")).links;

    await removeKinesisLinkAction("lt-finance-object", id);

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/finance/lt-finance");
    await expect(getKinesisLinkSection("lt-finance-object")).resolves.toMatchObject({ links: [] });
  });

  it("shows a Person the goal that links to them", async () => {
    await link("lt-goal-object", "lt-person-object");

    const links = await getPersonKinesisLinksAction("lt-person-object");

    expect(links).toMatchObject([{ target: { objectId: "lt-goal-object", name: "Emergency fund" } }]);
  });

  it("returns nothing for a person who isn't the caller's", async () => {
    await link("lt-goal-object", "lt-person-object");
    asUser(stranger);

    await expect(getPersonKinesisLinksAction("lt-person-object")).resolves.toEqual([]);
  });
});
