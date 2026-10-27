import { describe, expect, it } from "vitest";
import { normalizeUrl, withFragment } from "../src/extraction/url";

describe("normalizeUrl", () => {
  it("drops fragments, credentials and tracking params", () => {
    expect(normalizeUrl("https://user:pw@Example.com:443/a?utm_source=x&b=2&a=1#sec")).toBe(
      "https://example.com/a?a=1&b=2",
    );
  });

  it("keeps hash-routed fragments", () => {
    expect(normalizeUrl("https://app.example.com/#/inbox")).toBe("https://app.example.com/#/inbox");
  });

  it("resolves relative URLs against a base", () => {
    expect(normalizeUrl("../x", "https://example.com/a/b/c")).toBe("https://example.com/a/x");
  });

  it.each(["javascript:alert(1)", "mailto:a@b.c", "data:text/html,hi", "not a url", ""])(
    "rejects %s",
    (input) => expect(normalizeUrl(input)).toBeNull(),
  );
});

describe("withFragment", () => {
  it("encodes ids", () => {
    expect(withFragment("https://example.com/p", "a b")).toBe("https://example.com/p#a%20b");
  });
  it("returns undefined for invalid pages", () => {
    expect(withFragment("nope", "x")).toBeUndefined();
  });
});
