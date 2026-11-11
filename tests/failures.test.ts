import { beforeEach, describe, expect, it } from "vitest";
import { friendlyError, LibraryError } from "../src/library/errors";
import { Library } from "../src/library/library";
import type { BundleData } from "../src/storage/repository";
import type { PageCapture } from "../src/shared/types";
import { item } from "./fixtures";
import { MemoryRepository } from "./memory-repository";

class FlakyRepository extends MemoryRepository {
  full = false;
  broken = false;
  override async putItem(i: Parameters<MemoryRepository["putItem"]>[0]) {
    if (this.full) throw new DOMException("quota", "QuotaExceededError");
    return super.putItem(i);
  }
  override async listItems() {
    if (this.broken) throw new Error("database unavailable");
    return super.listItems();
  }
  override async applyBundle(data: BundleData, mode: "merge" | "replace") {
    if (this.full) throw new DOMException("quota", "QuotaExceededError");
    return super.applyBundle(data, mode);
  }
}

const capture = (text: string): PageCapture => ({
  source: { url: "https://example.com/a", pageTitle: "A" }, metadata: {}, headings: [], links: [], codeBlocks: [], selection: { text }, warnings: [],
});

let repo: FlakyRepository;
let library: Library;
let changes: number;
beforeEach(() => {
  changes = 0;
  repo = new FlakyRepository();
  library = new Library(repo, { onChange: () => { changes++; } });
});

describe("storage failures", () => {
  it("a full disk rejects the save, stores nothing, signals nothing, and recovers", async () => {
    repo.full = true;
    const error = await library.save(capture("one"), { kind: "selection" }).catch((e) => e);
    expect(error.name).toBe("QuotaExceededError");
    expect(friendlyError(error)).toContain("storage");
    expect(await library.listItems()).toEqual([]);
    expect(changes).toBe(0);

    repo.full = false;
    expect((await library.save(capture("one"), { kind: "selection" })).created).toBe(true);
    expect(changes).toBe(1);
  });

  it("a failed import leaves existing data alone and signals nothing", async () => {
    await library.save(capture("keep"), { kind: "selection" });
    changes = 0;
    repo.full = true;
    const bundle = { schemaVersion: 1, exportedAt: "2026-10-06T00:00:00.000Z", items: [item("new")], notes: [], collections: [] };
    await expect(library.importBundle(bundle, "replace")).rejects.toMatchObject({ name: "QuotaExceededError" });
    repo.full = false;
    expect((await library.listItems()).map((i) => i.content)).toEqual(["keep"]);
    expect(changes).toBe(0);
  });

  it("search recovers after the database was briefly unavailable", async () => {
    await library.save(capture("findable"), { kind: "selection" });
    repo.broken = true;
    await expect(library.search("findable")).rejects.toBeInstanceOf(Error);
    repo.broken = false;
    expect(await library.search("findable")).toHaveLength(1);
  });
});

describe("friendlyError", () => {
  it.each([
    [new LibraryError("not-found", "Item not found"), "Item not found"],
    [new DOMException("x", "QuotaExceededError"), "Browser storage for PagePocket is full. Export a backup, then delete items you no longer need."],
    [new DOMException("x", "InvalidStateError"), "Browser storage is unavailable right now. Close other PagePocket tabs and try again."],
    [new Error("anything else"), "Something went wrong."],
    [null, "Something went wrong."],
    ["a string", "Something went wrong."],
  ])("%#", (error, expected) => expect(friendlyError(error)).toBe(expected));

  it("uses the supplied fallback", () => {
    expect(friendlyError(new Error("x"), "Could not save.")).toBe("Could not save.");
  });
});
