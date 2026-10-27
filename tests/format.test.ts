import { describe, expect, it } from "vitest";
import { formatDate, plural } from "../src/shared/format";

describe("plural", () => {
  it.each([[0, "0 items"], [1, "1 item"], [2, "2 items"], [11, "11 items"]])("%s", (n, expected) =>
    expect(plural(n as number, "item")).toBe(expected),
  );
});

describe("formatDate", () => {
  it("formats valid ISO dates and passes invalid input through", () => {
    expect(formatDate("2026-10-05T10:00:00.000Z")).toContain("2026");
    expect(formatDate("not a date")).toBe("not a date");
  });
});
