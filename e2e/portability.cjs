const { readFileSync, writeFileSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { launch, reporter } = require("./lib.cjs");
const { check, finish } = reporter();

const T = "2026-10-05T10:00:00.000Z";
const seed = (page, stores) => page.evaluate((stores) => new Promise((res, rej) => {
  const r = indexedDB.open("contextlens", 1);
  r.onsuccess = () => {
    const names = Object.keys(stores); const tx = r.result.transaction(names, "readwrite");
    for (const n of names) stores[n].forEach((x) => tx.objectStore(n).put(x));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  };
}), stores);

const collections = [{ id: "c1", name: "PostgreSQL Research", createdAt: T, updatedAt: T }];
const items = [
  { id: "i1", type: "excerpt", content: "Read committed is the default.\n# sneaky <b>html</b>", capturedAt: T, tags: ["postgresql", "mvcc"], collectionIds: ["c1"], headingContext: "Isolation", source: { url: "https://www.postgresql.org/docs/tx", pageTitle: "PostgreSQL Transactions" } },
  { id: "i2", type: "code", language: "sql", content: "BEGIN;\nSELECT 1;", capturedAt: T, tags: [], collectionIds: ["c1"], source: { url: "https://www.postgresql.org/docs/tx", pageTitle: "PostgreSQL Transactions" } },
  { id: "i3", type: "page", content: "", capturedAt: T, tags: [], collectionIds: [], source: { url: "https://example.com/loose", pageTitle: "Loose page" } },
];
const notes = [{ id: "n1", target: { kind: "item", id: "i1" }, body: "double check this", createdAt: T, updatedAt: T }, { id: "n2", target: { kind: "collection", id: "c1" }, body: "scope: MVCC", createdAt: T, updatedAt: T }];

async function session() {
  const app = await launch();
  const page = await app.context.newPage();
  const errors = []; const dialogs = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await page.goto(`chrome-extension://${app.extensionId}/options.html`);
  return { app, page, errors, dialogs };
}
const download = async (page, selector) => {
  const [d] = await Promise.all([page.waitForEvent("download"), page.click(selector)]);
  const path = join(mkdtempSync(join(tmpdir(), "cl-dl-")), d.suggestedFilename());
  await d.saveAs(path);
  return { name: d.suggestedFilename(), text: readFileSync(path, "utf8"), path };
};
const importFile = async (page, path) => { await page.setInputFiles("#import-file", path); await page.waitForFunction(() => !document.getElementById("import-panel").hidden); await page.waitForTimeout(250); };
const nav = (page) => page.$$eval("#collections button", (b) => b.map((x) => x.textContent));
const write = (name, data) => { const p = join(mkdtempSync(join(tmpdir(), "cl-f-")), name); writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data)); return p; };

(async () => {
  console.log("--- export");
  const a = await session();
  await seed(a.page, { collections, items, notes }); await a.page.reload();
  await a.page.click("#data-tools summary");
  const json = await download(a.page, "#export-json");
  const bundle = JSON.parse(json.text);
  check("JSON backup contains everything", bundle.items.length === 3 && bundle.notes.length === 2 && bundle.collections.length === 1 && bundle.schemaVersion === 1);
  await a.page.click('[data-key="nav:c1"]'); await a.page.waitForTimeout(200);
  const md = await download(a.page, "#export-md");
  check("Markdown export is scoped to the collection and named after it", md.name === "postgresql-research.md" && !md.text.includes("Loose page"));
  check("Markdown carries source, date, tags, notes and the authorship line", ["Source: <https://www.postgresql.org/docs/tx>", "Captured: 2026-10-05", "`mvcc`", "double check this", "scope: MVCC", "original authors"].every((s) => md.text.includes(s)));
  check("captured HTML is neutralized in Markdown", !/(^|[^\\])<b>/.test(md.text) && md.text.includes("\\# sneaky"));
  await a.app.close();

  console.log("--- import into a fresh profile");
  const b = await session();
  await importFile(b.page, json.path);
  const preview = (await b.page.textContent("#import-summary")).replace(/\s+/g, " ");
  check("preview reports what will happen", preview.includes("Items: 3 new") && preview.includes("Notes: 2 new"), preview);
  await b.page.click("#import-confirm"); await b.page.waitForTimeout(400);
  check("merge imports everything and says so", (await b.page.textContent("#status")).startsWith("Imported 3 new items") && (await nav(b.page)).join() === "All items (3),PostgreSQL Research (2)");
  await b.page.fill("#query", "mvcc"); await b.page.waitForTimeout(300);
  check("imported data is searchable immediately", (await b.page.$$eval("article", (a) => a.length)) === 1);
  await b.page.fill("#query", "");

  await importFile(b.page, json.path);
  check("importing the same file again changes nothing", (await b.page.textContent("#import-summary")).includes("Items: 0 new, 0 merged into existing, 3 already present"));
  await b.page.click("#import-cancel");

  console.log("--- invalid files are refused whole");
  const evil = JSON.parse(json.text); evil.items[0].source.url = "javascript:alert(1)"; evil.items[1].tags = ["???"]; evil.items.push({ id: "x" });
  const cases = [["not JSON", write("a.json", "{nope"), "not valid JSON"], ["bad records", write("b.json", evil), "source.url"], ["newer format", write("c.json", { ...bundle, schemaVersion: 99 }), "Update PagePocket"]];
  for (const [label, path, expected] of cases) {
    await importFile(b.page, path);
    check(`${label}: errors listed, import disabled`, (await b.page.textContent("#import-problems")).includes(expected) && (await b.page.isDisabled("#import-confirm")));
  }
  await b.page.click("#import-cancel");
  check("existing data untouched by refused files", (await nav(b.page)).join() === "All items (3),PostgreSQL Research (2)");

  console.log("--- replace");
  await seed(b.page, { items: [{ id: "extra", type: "page", content: "", capturedAt: T, tags: [], collectionIds: [], source: { url: "https://example.com/extra", pageTitle: "Extra" } }] });
  await b.page.reload();
  check("extra item present before replace", (await nav(b.page))[0] === "All items (4)");
  await importFile(b.page, json.path);
  await b.page.check('input[value="replace"]'); await b.page.waitForTimeout(250);
  check("replace preview states the deletion", (await b.page.textContent("#import-summary")).includes("This deletes 4 items, 2 notes and 1 collection first."));
  await b.page.click("#import-confirm"); await b.page.waitForTimeout(400);
  check("replace asks for confirmation, then swaps the data", b.dialogs.some((d) => d.includes("permanently deletes 4 items")) && (await nav(b.page))[0] === "All items (3)");
  check("no uncaught errors", a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].join(" | "));
  await b.app.close(); finish();
})().catch((e) => { console.error("E2E CRASH", e.message); process.exit(2); });
