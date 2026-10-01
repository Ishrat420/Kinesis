import { describe, expect, it } from "vitest";
import { PUSH_OPEN_PARAM, selectNotificationsToPush, toPushPayload } from "@/lib/push/payload";
import { notificationKey, parseNotificationKey } from "@/lib/notifications/identity";
import type { DerivedNotification } from "@/lib/notifications/engine";

const notification = (key: string, readAt: Date | null = null) => ({ key, readAt }) as DerivedNotification;

describe("which bell items the daily run pushes (KD-053)", () => {
  it("pushes only unread items that haven't been pushed before", () => {
    const items = [notification("new"), notification("read", new Date()), notification("pushed")];
    expect(selectNotificationsToPush(items, new Set(["pushed"])).map(({ key }) => key)).toEqual(["new"]);
  });
});

describe("a push mirrors its bell row", () => {
  it("uses the row's title and message, and opens its page with the key attached", () => {
    const payload = toPushPayload({ key: "todo:t1:TODO_DUE:2030-01-05", documentName: "Renew rego", message: "Renew rego is due tomorrow", actionUrl: "/todos" });
    expect(payload).toEqual({
      title: "Renew rego",
      body: "Renew rego is due tomorrow",
      url: `/todos?${PUSH_OPEN_PARAM}=todo%3At1%3ATODO_DUE%3A2030-01-05`,
      tag: "todo:t1:TODO_DUE:2030-01-05",
    });
  });

  it("keeps a query string the page already had", () => {
    const { url } = toPushPayload({ key: "k", documentName: "", message: "", actionUrl: "/goals/g1?tab=milestones" });
    expect(url).toBe(`/goals/g1?tab=milestones&${PUSH_OPEN_PARAM}=k`);
  });
});

describe("reading a notification key back", () => {
  it("recovers the record from a key notificationKey made", () => {
    expect(parseNotificationKey(notificationKey("relationship", "date-1", "REMINDER_DUE", new Date("2030-03-04T00:00:00Z")))).toEqual({ source: "relationship", sourceId: "date-1" });
  });

  it("refuses anything that isn't a well-formed key", () => {
    for (const key of ["", "todo", "todo:t1", "unknown:t1:TODO_DUE:2030-01-05", "todo::TODO_DUE:2030-01-05"]) {
      expect(parseNotificationKey(key)).toBeNull();
    }
  });
});
