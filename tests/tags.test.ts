import { describe, expect, it } from "vitest";
import { normalizeTag, normalizeTagList, parseTagInput } from "../src/library/tags";

describe("normalizeTag", () => {
  it.each([
    ["  #PostgreSQL ", "postgresql"],
    ["Row Level Security", "row-level-security"],
    ["c#", "c#"],
    ["node.js", "node.js"],
    ["a//b", "a-b"],
    ["Café", "café"],
  ])("%s", (input, expected) => expect(normalizeTag(input)).toBe(expected));

  it.each(["", "   ", "!!!", "#", "x".repeat(41)])("rejects %s", (input) => expect(normalizeTag(input)).toBeNull());
});

describe("tag lists", () => {
  it("splits on commas and newlines", () => {
    expect(parseTagInput("a, b\nc,, ")).toEqual(["a", "b", "c"]);
  });

  it("dedupes after normalization and throws on invalid entries", () => {
    expect(normalizeTagList(["SQL", "#sql", "Db"])).toEqual(["sql", "db"]);
    expect(() => normalizeTagList(["ok", "???"])).toThrow();
  });
});
