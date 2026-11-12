// Regenerates docs/screenshots from the built extension. All content below is
// invented and uses example.org hosts: a screenshot must never show made-up
// text attributed to a real site.
const { mkdirSync } = require("node:fs");
const { launch } = require("./lib.cjs");

const OUT = "docs/screenshots";
const day = (n) => `2026-10-0${n}T10:00:00.000Z`;
const page = { url: "https://docs.example.org/database/transactions", pageTitle: "Transactions - Example Database Docs" };
const collections = [
  { id: "c1", name: "Database research", createdAt: day(1), updatedAt: day(1) },
  { id: "c2", name: "Build tooling", createdAt: day(1), updatedAt: day(1) },
];
const items = [
  { id: "i1", type: "excerpt", capturedAt: day(5), tags: ["transactions", "isolation"], collectionIds: ["c1"], headingContext: "Isolation levels", source: page,
    content: "Each transaction sees a snapshot of the data as it was when the statement began, so readers do not block writers." },
  { id: "i2", type: "code", language: "sql", capturedAt: day(5), tags: ["transactions"], collectionIds: ["c1"], headingContext: "Explicit locking", source: page,
    content: "BEGIN;\nSELECT balance FROM accounts WHERE id = 1 FOR UPDATE;\nUPDATE accounts SET balance = balance - 25 WHERE id = 1;\nCOMMIT;" },
  { id: "i3", type: "page", capturedAt: day(4), tags: ["reference"], collectionIds: ["c1"], content: "How concurrent transactions are isolated from each other.",
    source: { url: "https://docs.example.org/database/concurrency", pageTitle: "Concurrency control - Example Database Docs", canonicalUrl: "https://docs.example.org/database/concurrency" } },
  { id: "i4", type: "link", capturedAt: day(3), tags: [], collectionIds: ["c2"], content: "Bundler configuration guide", targetUrl: "https://tools.example.org/bundler/config",
    source: { url: "https://blog.example.org/fast-builds", pageTitle: "Faster builds - Example Blog" } },
];
const notes = [
  { id: "n1", target: { kind: "item", id: "i1" }, body: "Compare with the locking behaviour in the next section.", createdAt: day(5), updatedAt: day(5) },
  { id: "n2", target: { kind: "collection", id: "c1" }, body: "Goal: decide between optimistic and pessimistic locking for the ledger service.", createdAt: day(5), updatedAt: day(5) },
];
const FAKE = { ok: true, data: { source: page, metadata: {}, warnings: [],
  headings: [{ level: 2, text: "Isolation levels", id: "iso", url: `${page.url}#iso` }, { level: 2, text: "Explicit locking", id: "lock", url: `${page.url}#lock` }],
  links: [{ url: "https://docs.example.org/database/concurrency", text: "Concurrency control" }],
  codeBlocks: [{ content: "SELECT * FROM accounts FOR UPDATE;", language: "sql" }],
  selection: { text: "Each transaction sees a snapshot of the data as it was when the statement began.", headingContext: "Isolation levels" } } };

(async () => {
  mkdirSync(OUT, { recursive: true });
  const app = await launch();
  const o = await app.context.newPage();
  await o.setViewportSize({ width: 1280, height: 800 });
  await o.goto(`chrome-extension://${app.extensionId}/options.html`);
  await o.evaluate(({ collections, items, notes }) => new Promise((res, rej) => {
    const r = indexedDB.open("contextlens", 1);
    r.onsuccess = () => { const tx = r.result.transaction(["collections", "items", "notes"], "readwrite");
      collections.forEach((x) => tx.objectStore("collections").put(x)); items.forEach((x) => tx.objectStore("items").put(x)); notes.forEach((x) => tx.objectStore("notes").put(x));
      tx.oncomplete = res; tx.onerror = () => rej(tx.error); };
  }), { collections, items, notes });
  await o.reload();

  await o.click('[data-key="nav:c1"]'); await o.waitForTimeout(300);
  await o.screenshot({ path: `${OUT}/library.png` });

  await o.click('[data-key="nav:__all__"]'); await o.fill("#query", "snapshot tag:isolation"); await o.waitForTimeout(400);
  await o.screenshot({ path: `${OUT}/search.png` });

  await o.fill("#query", ""); await o.click('[data-key="nav:c1"]'); await o.emulateMedia({ colorScheme: "dark" }); await o.waitForTimeout(100); const themeButton = o.locator("#theme-toggle"); if ((await themeButton.textContent())?.toLowerCase().includes("dark")) await themeButton.click(); await o.waitForFunction(() => document.documentElement.dataset.theme === "dark"); await o.waitForTimeout(300);
  await o.screenshot({ path: `${OUT}/library-dark.png` });

  const p = await app.context.newPage();
  await p.addInitScript((c) => { const orig = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = (m, ...r) => (m && m.type === "capture-page" ? Promise.resolve(c) : orig(m, ...r)); }, FAKE);
  await p.setViewportSize({ width: 380, height: 540 });
  await p.goto(`chrome-extension://${app.extensionId}/popup.html`);
  await p.waitForSelector("#main:not([hidden])"); await p.selectOption("#collection", { label: "Database research" }); await p.fill("#tags", "transactions, snapshots"); await p.waitForTimeout(200);
  await p.screenshot({ path: `${OUT}/popup.png` });
  await app.close();
  console.log("wrote", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
