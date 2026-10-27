import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const source = files(join(process.cwd(), "src"));
const code = source.filter((f) => f.endsWith(".ts"));
const markup = source.filter((f) => /\.(html|css)$/.test(f));

// Static guard for the privacy claims in the README: no code path can send
// data off the machine, and nothing builds markup from untrusted strings.
const FORBIDDEN: [string, RegExp][] = [
  ["network request (fetch)", /\bfetch\s*\(/],
  ["network request (XMLHttpRequest)", /XMLHttpRequest/],
  ["network request (WebSocket)", /\bWebSocket\b/],
  ["network request (EventSource)", /\bEventSource\b/],
  ["network request (sendBeacon)", /sendBeacon/],
  ["remote script loading", /importScripts|\bimport\s*\(\s*["']https?:/],
  ["dynamic code (eval)", /\beval\s*\(/],
  ["dynamic code (Function)", /new\s+Function\s*\(/],
  ["string timers", /set(Timeout|Interval)\s*\(\s*["'`]/],
  ["HTML injection (innerHTML)", /\.(inner|outer)HTML\s*=/],
  ["HTML injection (insertAdjacentHTML)", /insertAdjacentHTML/],
  ["HTML injection (document.write)", /document\.write/],
  ["telemetry or analytics identifiers", /google-analytics|gtag\(|sentry|mixpanel|segment\.io|amplitude/i],
];

describe("privacy and safety guard", () => {
  it("finds the source tree", () => {
    expect(code.length > 20).toBe(true);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`no ${label} in extension source`, () => {
      const hits = code.filter((file) => pattern.test(readFileSync(file, "utf8")));
      expect(hits).toEqual([]);
    });
  }

  it("pages load nothing from the network", () => {
    const hits = markup.filter((file) => /(src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:|@import\s+(url\()?["']?https?:/i.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("only extension-local scripts are referenced from pages", () => {
    for (const file of markup.filter((f) => f.endsWith(".html"))) {
      const scripts = [...readFileSync(file, "utf8").matchAll(/<script[^>]*>/g)].map((m) => m[0]);
      for (const tag of scripts) expect(/src="[a-z]+\.js"/.test(tag)).toBe(true);
    }
  });
});
