const { launch, hostPermissionBuild, loadFixtures, reporter } = require("./lib.cjs");
const P = loadFixtures();
const { check, finish } = reporter();
const EXT_LOCAL = /^(chrome-extension|blob|data|about):/;

(async () => {
  const app = await launch(hostPermissionBuild()); const ctx = app.context; const id = app.extensionId;
  const extensionRequests = []; const pageRequests = new Map();
  ctx.on("request", (r) => {
    if (r.isNavigationRequest()) return;
    let fromSw = false, frameUrl = "";
    try { frameUrl = r.frame().url(); } catch { fromSw = true; }
    if (fromSw || frameUrl.startsWith("chrome-extension://")) extensionRequests.push(r.url());
    else (pageRequests.get(frameUrl) ?? pageRequests.set(frameUrl, []).get(frameUrl)).push(r.url());
  });
  const popup = await ctx.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);

  const open = async (fixture, { extra = "", selectId } = {}) => {
    const t = await ctx.newPage();
    const doc = fixture.url.split("#")[0];
    await t.route("https://**/*", (r) => r.request().url().split("#")[0] === doc ? r.fulfill({ contentType: "text/html; charset=utf-8", body: fixture.html.replace("</body>", extra + "</body>") }) : r.fulfill({ status: 204, body: "" }));
    await t.goto(fixture.url);
    if (selectId) await t.evaluate((sid) => { const r = document.createRange(); r.selectNodeContents(document.getElementById(sid)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, selectId);
    await t.bringToFront();
    return t;
  };
  const capture = () => popup.evaluate(() => chrome.runtime.sendMessage({ type: "capture-page" }));

  console.log("--- real injection and extraction on fixture pages");
  let t = await open(P.GITHUB, { selectId: "intro" }); let r = await capture();
  check("GitHub: ok, README-scoped links/code, anchor deep link, selection heading",
    r.ok && r.data.links.length === 1 && r.data.codeBlocks[0].language === "shell" && r.data.headings[1].url.endsWith("#building") && r.data.selection.headingContext === "PostgreSQL Database Management System", JSON.stringify(r.error ?? ""));
  const again = await capture();
  check("capturing the same tab again works (no duplicate listener problem)", again.ok && again.data.headings.length === 2);
  await t.close();

  t = await open(P.DOCUSAURUS); r = await capture();
  check("Docusaurus: multi-line code from <br>, clean headings", r.ok && r.data.codeBlocks[0].content === "npm install foo\nnpm run build" && r.data.headings[1].text === "Install");
  await t.close();

  t = await open(P.MDN); r = await capture();
  check("MDN: relative links resolved, nav excluded", r.ok && r.data.links.length === 1 && r.data.links[0].url.startsWith("https://developer.mozilla.org/"));
  await t.close();

  t = await open(P.SPHINX, { selectId: "usage" }); r = await capture();
  check("Sphinx: python code, selection under 'Basic Usage'", r.ok && r.data.codeBlocks[0].language === "python" && r.data.selection.headingContext === "Basic Usage");
  await t.close();

  t = await open(P.BLOG); r = await capture();
  check("blog: metadata and normalized link", r.ok && r.data.metadata.author === "Grace Hopper" && r.data.links[0].url === "https://www.postgresql.org/docs/current/mvcc.html");
  await t.close();

  console.log("--- dynamic content (real timers)");
  const script = `<script>setTimeout(function(){document.getElementById("root").innerHTML=${JSON.stringify(P.SPA_RENDERED)}},600)</script>`;
  t = await open(P.SPA_SHELL, { extra: script }); const early = await capture();
  await t.waitForSelector("h1", { timeout: 4000 }); const late = await capture();
  check("before render: empty but successful; after render: content captured", early.ok && early.data.headings.length === 0 && late.ok && late.data.headings[0].text === "Quarterly report" && late.data.codeBlocks[0].language === "typescript");
  await t.close();

  console.log("--- failure paths through the real message chain");
  t = await ctx.newPage(); await t.goto("chrome://version"); await t.bringToFront(); r = await capture();
  check("restricted page (chrome://): graceful error, no hang", !r.ok && r.error.code === "restricted-page", JSON.stringify(r));
  await t.goto("about:blank"); r = await capture();
  check("about:blank: graceful error", !r.ok && r.error.code === "restricted-page");
  await t.close();

  console.log("--- performance on a very large page");
  t = await open(P.hugePage()); const t0 = Date.now(); r = await capture(); const ms = Date.now() - t0;
  check(`2000 headings, 2000 links, 300 code blocks: capped output in ${ms} ms`, r.ok && r.data.headings.length === 200 && r.data.links.length === 100 && r.data.codeBlocks.length === 100 && ms < 1500);
  await t.close();

  console.log("--- network privacy during the whole session");
  const strays = extensionRequests.filter((u) => !EXT_LOCAL.test(u));
  check(`extension pages and service worker made no network requests (${extensionRequests.length} local)`, strays.length === 0, strays.join(", "));
  const pageStrays = [...pageRequests.entries()].filter(([frame]) => !frame.startsWith("chrome://")).flatMap(([frame, urls]) => urls.filter((u) => u.split("#")[0] !== frame.split("#")[0] && !u.endsWith("favicon.ico")));
  check("content script made no requests from the pages it ran in", pageStrays.length === 0, pageStrays.slice(0, 3).join(", "));

  await app.close(); finish();
})().catch((e) => { console.error("E2E CRASH", e.message); process.exit(2); });
