# Browser support

Status is stated as what has actually been run, not what is expected to work.

| Area | Chrome / Chromium | Firefox |
|---|---|---|
| Builds (`npm run build`) | Verified | Verified (produces `dist/firefox`) |
| Loads as an extension | Verified (Chromium, unpacked) | **Not run** |
| Manifest passes `web-ext lint` | n/a | **Not run** (needs network to install; runs in CI) |
| Extraction logic | Verified in Chromium against realistic page fixtures | **Not run** (Gecko DOM) |
| Popup, options page, search, export and import | Verified in Chromium (`npm run e2e`) | **Not run** |
| On-demand injection through `activeTab` | **Not automatable.** Verified with a test-only build that adds host permissions; the real user-gesture grant has been checked by nobody yet | **Not run** |
| Context-menu save | Logic unit-tested; the menu click itself is not automatable | **Not run** |

"Chromium-based browsers" (Edge, Brave, Opera, Vivaldi) share the Chrome manifest and APIs and are expected to work. None has been tried.

## Minimum versions

- **Chrome 114.** This is the esbuild target, not a tested floor.
- **Firefox 140 (desktop), 142 (Android).** Firefox requires `data_collection_permissions` for new add-ons submitted to addons.mozilla.org since 3 November 2025, and that key is understood from those versions. PagePocket declares `required: ["none"]`. Source: MDN, `browser_specific_settings`.

## Differences handled in code

- **Background:** Chrome gets a service worker, Firefox gets an event page (`background.scripts`). Same bundle, different manifest key (`scripts/manifest.mjs`).
- **API namespace:** all extension APIs go through `src/shared/api.ts`, which uses `browser` where it exists (Firefox, promise-based) and `chrome` otherwise (Chrome MV3, promise-based). This avoids depending on whether `chrome.*` returns promises in Firefox.
- **Content-script guard:** the "already injected" flag lives on `globalThis`, because properties set on `window` are not guaranteed to survive between injections in Firefox.
- **Add-on id:** Firefox needs `browser_specific_settings.gecko.id`. The build uses a placeholder unless `GECKO_ID` is set; **replace it before any release**.
- **Restricted pages:** both browsers refuse injection on browser-internal and store pages. The extension reports "This page cannot be captured by extensions." instead of failing silently.
- **Downloads and file input:** export uses a Blob link from the options page and import uses a file input, so no `downloads` permission is needed in either browser.

## Manual checklist for Firefox

1. `about:debugging` > This Firefox > Load Temporary Add-on > `dist/firefox/manifest.json`.
2. Open a documentation page, click the toolbar button, save a page, a selection and a code block.
3. Right-click a selection > "Save selection to PagePocket"; the toolbar badge should show OK.
4. Open the library: search, tag, add a note, move an item to a collection.
5. Export JSON and Markdown; import the JSON into a fresh profile.
6. Try `about:preferences` and `addons.mozilla.org`: the popup should say the page cannot be captured.
7. Run `npx web-ext lint --source-dir dist/firefox` and fix anything it reports.

## Known limitations that apply to both browsers

- Extraction runs when you click, so content that has not rendered yet is not captured; content inside shadow roots and iframes is not reached.
- A schema upgrade opened by a newer version while an old extension page is open closes the old page's database connection; that page needs a reload.
