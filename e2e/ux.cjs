const { launch, reporter } = require("./lib.cjs");
const { check, finish } = reporter();

const AUDIT = () => {
  const out = { unnamed: [], contrast: [], controls: [], overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
  const cv = document.createElement("canvas"); cv.width = cv.height = 1; const g = cv.getContext("2d", { willReadFrequently: true });
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e); g.clearRect(0,0,1,1); g.fillStyle = "#fff"; g.fillRect(0,0,1,1);
    for (const e of chain) { const bg = getComputedStyle(e).backgroundColor; if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") { g.fillStyle = bg; g.fillRect(0,0,1,1); } } return [...g.getImageData(0,0,1,1).data]; };
  const over = (css, bg) => { g.clearRect(0,0,1,1); g.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; g.fillRect(0,0,1,1); g.fillStyle = css; g.fillRect(0,0,1,1); return [...g.getImageData(0,0,1,1).data]; };
  const lum = ([r,gg,b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126*f(r)+0.7152*f(gg)+0.0722*f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${(el.textContent || "").trim().slice(0, 25)}"`;

  for (const el of document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary")) {
    if (!visible(el)) continue;
    const labelled = el.getAttribute("aria-labelledby") ? document.getElementById(el.getAttribute("aria-labelledby"))?.textContent.trim() : "";
    const name = el.getAttribute("aria-label") || labelled || [...(el.labels || [])].map((l) => l.textContent.trim()).join(" ") || el.textContent.trim() || el.title || "";
    if (!name) out.unnamed.push(desc(el) + (el.placeholder ? ` (placeholder only: ${el.placeholder})` : ""));
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || el.disabled) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el); const bg = bgOf(el); const fg = over(cs.color, bg);
    const r = ratio(fg, bg); if (r < 4.5) out.contrast.push(`${desc(el)} ${r.toFixed(2)}`);
  }
  for (const el of document.querySelectorAll("button, input:not([type=file]):not([type=radio]):not([type=checkbox]), select, textarea")) {
    if (!visible(el) || el.disabled) continue;
    const cs = getComputedStyle(el); const parentBg = bgOf(el.parentElement);
    const r = ratio(over(cs.borderTopColor, parentBg), parentBg); if (r < 3) out.controls.push(`${desc(el)} border ${r.toFixed(2)}`);
  }
  return out;
};
const report = async (p, name, scheme) => {
  await p.emulateMedia({ colorScheme: scheme }); await p.waitForTimeout(150);
  const a = await p.evaluate(AUDIT);
  check(`${name} [${scheme}]: every control has an accessible name`, a.unnamed.length === 0, a.unnamed.slice(0, 4).join(" | "));
  check(`${name} [${scheme}]: text contrast >= 4.5:1`, a.contrast.length === 0, a.contrast.slice(0, 4).join(" | "));
  check(`${name} [${scheme}]: control borders >= 3:1`, a.controls.length === 0, a.controls.slice(0, 4).join(" | "));
  check(`${name} [${scheme}]: no horizontal overflow`, !a.overflow);
};
const key = (p) => p.evaluate(() => document.activeElement?.dataset?.key ?? document.activeElement?.id ?? document.activeElement?.tagName);

const seed = (page, stores) => page.evaluate((stores) => new Promise((res, rej) => { const r = indexedDB.open("contextlens", 1); r.onsuccess = () => {
  const names = Object.keys(stores); const tx = r.result.transaction(names, "readwrite"); for (const n of names) stores[n].forEach(x => tx.objectStore(n).put(x)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }; }), stores);
const T = "2026-10-05T10:00:00.000Z";
const cols = ["c1:Alpha", "c2:Beta"].map((s) => ({ id: s.split(":")[0], name: s.split(":")[1], createdAt: T, updatedAt: T }));
const items = [
  { id: "i1", type: "excerpt", content: "Read committed is the default isolation level.", capturedAt: T, tags: ["postgresql"], collectionIds: ["c1"], headingContext: "Isolation", source: { url: "https://www.postgresql.org/docs/tx", pageTitle: "PostgreSQL Transactions" } },
  { id: "i2", type: "code", language: "sql", content: "SELECT 1;\nBEGIN;", capturedAt: "2026-10-05T10:05:00.000Z", tags: [], collectionIds: ["c1"], source: { url: "https://www.postgresql.org/docs/tx", pageTitle: "PostgreSQL Transactions" } },
  { id: "i3", type: "page", content: "", capturedAt: "2026-10-04T10:00:00.000Z", tags: [], collectionIds: [], source: { url: "https://example.com/loose", pageTitle: "Loose page" } },
];
const notes = [{ id: "n1", target: { kind: "item", id: "i1" }, body: "double check this", createdAt: T, updatedAt: T }];
const FAKE = { source: { url: "https://example.com/article", pageTitle: "An Article About Locks" }, metadata: {}, warnings: [],
  headings: [{ level: 2, text: "Row locks", id: "rl", url: "https://example.com/article#rl" }], links: [{ url: "https://github.com/x/y", text: "Repo" }],
  codeBlocks: [{ content: "SELECT * FROM t FOR UPDATE;", language: "sql" }], selection: { text: "FOR UPDATE locks selected rows.", headingContext: "Row locks" } };

(async () => {
  const app = await launch(); const ctx = app.context;
  const id = app.extensionId;
  const errors = []; const dialogs = [];
  const o = await ctx.newPage(); o.on("pageerror", (e) => errors.push(e.message)); o.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });
  await o.goto(`chrome-extension://${id}/options.html`);
  await seed(o, { collections: cols, items, notes }); await o.reload();

  console.log("--- options: keyboard and focus");
  await o.click("h1"); await o.keyboard.press("/");
  check("'/' focuses the search box", (await key(o)) === "query");
  await o.keyboard.type("isolation"); await o.waitForTimeout(300);
  check("search narrows results", (await o.$$eval("article", a => a.length)) === 1);
  await o.keyboard.press("Escape"); await o.waitForTimeout(300);
  check("Escape clears search, keeps focus, restores all items", (await o.inputValue("#query")) === "" && (await key(o)) === "query" && (await o.$$eval("article", a => a.length)) === 3);

  await o.click('[data-key="nav:c2"]'); await o.waitForTimeout(200);
  check("focus stays on a collection button after it re-renders", (await key(o)) === "nav:c2");
  await o.click('[data-key="nav:__all__"]'); await o.waitForTimeout(200);

  await o.fill('[data-key="item:i2:note-input"]', "unsent draft");
  await o.focus('[data-key="item:i1:tag-input"]'); await o.keyboard.type("mvcc"); await o.keyboard.press("Enter"); await o.waitForTimeout(300);
  check("Enter adds a tag, input cleared, focus kept on it", (await o.$$eval('[data-key="item:i1:tag:mvcc"]', e => e.length)) === 1 && (await o.inputValue('[data-key="item:i1:tag-input"]')) === "" && (await key(o)) === "item:i1:tag-input");
  check("unsent text in another item's note box survives the re-render", (await o.inputValue('[data-key="item:i2:note-input"]')) === "unsent draft");
  await o.fill('[data-key="item:i2:note-input"]', "");

  await o.click('[data-key="note:n1:edit-btn"]'); await o.waitForTimeout(200);
  check("Edit moves focus into the note editor", (await key(o)) === "note:n1:edit");
  await o.keyboard.press("End"); await o.keyboard.type(" (edited)"); await o.keyboard.press("Control+Enter"); await o.waitForTimeout(300);
  check("Ctrl+Enter saves the note and returns focus to Edit", (await o.textContent('article:has([data-key="note:n1:edit-btn"]) .notes p')).includes("(edited)") && (await key(o)) === "note:n1:edit-btn");
  await o.click('[data-key="note:n1:edit-btn"]'); await o.waitForTimeout(300); await o.keyboard.type("zzz"); await o.keyboard.press("Escape"); await o.waitForTimeout(300);
  { const hasZ = (await o.textContent("#items")).includes("zzz"); const k = await key(o); const notesText = await o.$$eval(".notes li p", (p) => p.map((x) => x.textContent));
  check("Escape cancels editing without saving", !hasZ && k === "note:n1:edit-btn", `zzz present=${hasZ}, focus=${k}, notes=${JSON.stringify(notesText)}`); }

  console.log("--- options: collections and notes");
  await o.selectOption('[data-key="item:i3:collection-select"]', { label: "Beta" }); await o.click('[data-key="item:i3:collection-add"]'); await o.waitForTimeout(300);
  check("item can be added to a collection from its card", (await o.$$eval('[data-key="item:i3:collection:c2"]', e => e.length)) === 1 && (await o.textContent('[data-key="nav:c2"]')) === "Beta (1)");
  await o.click('[data-key="item:i3:collection:c2"]'); await o.waitForTimeout(300);
  check("and removed again", (await o.textContent('[data-key="nav:c2"]')) === "Beta (0)");

  await o.click('[data-key="nav:c1"]'); await o.waitForTimeout(200);
  await o.fill('[data-key="collection:c1:note-input"]', "scope: isolation levels"); await o.keyboard.press("Control+Enter"); await o.waitForTimeout(300);
  check("collection-level note can be added", (await o.textContent("#collection-notes")).includes("scope: isolation levels"));
  await o.reload(); await o.click('[data-key="nav:c1"]'); await o.waitForTimeout(200);
  check("and persists", (await o.textContent("#collection-notes")).includes("scope: isolation levels"));
  check("heading and count describe the view", (await o.textContent("#results-heading")) === "Alpha" && (await o.textContent("#result-count")) === "2 items");
  check("collection tools are visible for a collection", await o.isVisible("#collection-tools"));
  await o.click('[data-key="nav:__all__"]'); await o.waitForTimeout(200);
  check("collection tools and notes are hidden in the All items view", (await o.isHidden("#collection-tools")) && (await o.$$eval("#collection-notes *", (e) => e.length)) === 0);
  await o.fill("#query", "isolation"); await o.waitForTimeout(300);
  check("and stay hidden while searching all items", await o.isHidden("#collection-tools"));
  await o.fill("#query", ""); await o.waitForTimeout(300);

  await o.click('[data-key="item:i3:delete"]'); await o.waitForTimeout(300);
  check("delete asks for confirmation naming the item", dialogs.some((d) => d.includes("Loose page")));
  check("after deleting, focus lands on the results heading", (await key(o)) === "results-heading" && (await o.$$eval("article", a => a.length)) === 2);

  console.log("--- options: empty and error states");
  await o.fill("#query", "nonexistentword"); await o.waitForTimeout(300);
  check("empty search explains what to try", (await o.textContent("#items")).includes("Try fewer words"));
  await o.fill("#query", ""); await o.waitForTimeout(300);
  await o.fill("#new-name", "alpha"); await o.click('#new-collection button'); await o.waitForTimeout(200);
  check("duplicate name error is announced in the live region", (await o.textContent("#status")).includes("already exists") && (await o.getAttribute("#status", "role")) === "status");

  console.log("--- options: audits");
  for (const scheme of ["light", "dark"]) await report(o, "options", scheme);
  await o.setViewportSize({ width: 360, height: 760 }); await report(o, "options @360px", "light");
  await o.setViewportSize({ width: 1280, height: 800 });

  console.log("--- popup (page capture stubbed, everything else real)");
  const stubbed = async (capture) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push("popup: " + e.message));
    await p.addInitScript((c) => { const orig = chrome.runtime.sendMessage.bind(chrome.runtime); chrome.runtime.sendMessage = (m, ...r) => (m && m.type === "capture-page" ? Promise.resolve(c) : orig(m, ...r)); }, capture);
    await p.setViewportSize({ width: 380, height: 600 }); await p.goto(`chrome-extension://${id}/popup.html`); await p.waitForSelector("#main:not([hidden]), #status.error"); await p.waitForTimeout(250); return p; };

  const p1 = await stubbed({ ok: true, data: FAKE });
  check("popup focuses the primary action (selection present)", (await key(p1)) === "save-selection" && await p1.evaluate(() => document.getElementById("save-selection").classList.contains("primary")));
  await p1.selectOption("#collection", { label: "Alpha" });
  await p1.fill("#tags", "locks, Row Level"); await p1.keyboard.press("Enter"); await p1.waitForTimeout(400);
  check("Enter in the tags field saves the selection", (await p1.textContent("#status")).startsWith("Saved selection to Alpha"), await p1.textContent("#status"));
  await p1.keyboard.press("Enter"); await p1.waitForTimeout(300);
  check("saving again says it was already saved", (await p1.textContent("#status")).includes("already saved"), await p1.textContent("#status"));
  await p1.click("#code-summary"); await p1.click('#code-list button'); await p1.waitForTimeout(300);
  check("a code block can be saved from the list", (await p1.textContent("#status")).startsWith("Saved code block"));
  await report(p1, "popup", "light"); await report(p1, "popup", "dark");

  const p2 = await stubbed({ ok: true, data: { ...FAKE, selection: null, codeBlocks: [], links: [], headings: [] } });
  check("without a selection: page button is primary, selection disabled with a reason", (await key(p2)) === "save-page" && await p2.isDisabled("#save-selection") && (await p2.textContent("#selection-hint")).includes("Select text"));
  check("empty lists are hidden rather than shown as '0 links'", (await p2.$$eval("details", d => d.filter(x => !x.hidden).length)) === 0);

  const p3 = await stubbed({ ok: false, error: { code: "restricted-page", message: "This page cannot be captured by extensions." } });
  check("restricted page: error shown, library still reachable, focus on it", (await p3.textContent("#status")).includes("cannot be captured") && (await key(p3)) === "open-library" && await p3.isHidden("#main"));
  await o.goto("about:blank");
  const [lib] = await Promise.all([ctx.waitForEvent("page"), p3.click("#open-library")]); await lib.waitForLoadState();
  check("'Open library' opens the options page", lib.url().endsWith("options.html"));

  await lib.close(); await o.goto(`chrome-extension://${id}/options.html`); await o.waitForTimeout(400);
  const saved = await o.$$eval("article", (a) => a.map((x) => x.querySelector("h3").textContent + " | " + [...x.querySelectorAll(".chips li button")].map((b) => b.textContent).join(",")));
  check("items saved from the popup appear in the library with tags and collection", saved.some((s) => s.includes("An Article About Locks") && s.includes("locks") && s.includes("row-level") && s.includes("Alpha")), saved.join(" ;; "));
  check("no uncaught page errors", errors.length === 0, errors.join(" | "));
  await app.close(); finish();
})().catch((e) => { console.error("E2E CRASH", e.message); process.exit(2); });
