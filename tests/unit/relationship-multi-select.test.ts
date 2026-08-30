import { describe, expect, it } from "vitest";
import { connectPairStatus, hasRelationshipBetween, isSelfPerson, toggleMultiSelect } from "@/lib/relationships";

const connection = (from: string, to: string) => ({ from, to });

describe("toggleMultiSelect", () => {
  it("adds the first two people to the selection", () => {
    expect(toggleMultiSelect([], "ana")).toEqual(["ana"]);
    expect(toggleMultiSelect(["ana"], "bruno")).toEqual(["ana", "bruno"]);
  });

  it("never selects more than two people, replacing the second pick", () => {
    expect(toggleMultiSelect(["ana", "bruno"], "cleo")).toEqual(["ana", "cleo"]);
    expect(toggleMultiSelect(["ana", "cleo"], "dana")).toHaveLength(2);
  });

  it("deselects a person who is picked again", () => {
    expect(toggleMultiSelect(["ana", "bruno"], "bruno")).toEqual(["ana"]);
    expect(toggleMultiSelect(["ana", "bruno"], "ana")).toEqual(["bruno"]);
    expect(toggleMultiSelect(["ana"], "ana")).toEqual([]);
  });

  it("cannot hold the same person twice, so self-to-self never forms a pair", () => {
    const selected = toggleMultiSelect(toggleMultiSelect([], "ana"), "ana");
    expect(selected).toEqual([]);
  });

  it("leaves the previous selection untouched", () => {
    const selected = ["ana", "bruno"];
    toggleMultiSelect(selected, "cleo");
    expect(selected).toEqual(["ana", "bruno"]);
  });
});

describe("hasRelationshipBetween", () => {
  it("finds a connection stored either way round", () => {
    const relationships = [connection("ana", "bruno")];
    expect(hasRelationshipBetween(relationships, "ana", "bruno")).toBe(true);
    expect(hasRelationshipBetween(relationships, "bruno", "ana")).toBe(true);
  });

  it("does not match people who share only one end of a connection", () => {
    expect(hasRelationshipBetween([connection("ana", "bruno")], "ana", "cleo")).toBe(false);
    expect(hasRelationshipBetween([], "ana", "bruno")).toBe(false);
  });
});

describe("connectPairStatus", () => {
  it("waits until two people are selected", () => {
    expect(connectPairStatus([], [])).toBe("incomplete");
    expect(connectPairStatus(["ana"], [])).toBe("incomplete");
  });

  it("offers the connection for two unconnected people", () => {
    expect(connectPairStatus(["ana", "bruno"], [])).toBe("ready");
    expect(connectPairStatus(["ana", "bruno"], [connection("ana", "cleo")])).toBe("ready");
  });

  it("refuses a duplicate connection in either direction", () => {
    expect(connectPairStatus(["ana", "bruno"], [connection("ana", "bruno")])).toBe("already-connected");
    expect(connectPairStatus(["ana", "bruno"], [connection("bruno", "ana")])).toBe("already-connected");
  });

  it("refuses to connect a person to themselves", () => {
    expect(connectPairStatus(["ana", "ana"], [])).toBe("same-person");
  });
});

describe("isSelfPerson", () => {
  it("recognises the bubble that represents the account owner", () => {
    expect(isSelfPerson({ detail: "You" })).toBe(true);
    expect(isSelfPerson({ detail: "Friend" })).toBe(false);
    expect(isSelfPerson({ detail: "Relationship" })).toBe(false);
  });
});
