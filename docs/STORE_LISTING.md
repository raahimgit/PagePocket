# Store listing drafts

**PagePocket has not been submitted to the Chrome Web Store or Firefox Add-ons, and nothing here has been reviewed by either.** These are drafts to adapt when the checklist at the end is done.

## Name and summary

- **Name:** PagePocket
- **Summary (132 characters maximum, kept in sync with the manifest):** Save pages, snippets and screenshots with their sources. Search and organize them privately.
- **Category suggestions:** Developer Tools or Productivity (Chrome); Other or Search Tools (Firefox). Choose at submission.

## Description

PagePocket is a private library for useful pages and snippets. Save a page, selected text, code, a heading, a link or a screenshot. Every item keeps its source URL and page title, plus the section it came from when available. Organize items with collections, tags and notes, search them locally, then export a collection as Markdown or your full library as a JSON backup.

- No account, no server, no sync service.
- No generative AI, analytics or telemetry. PagePocket makes no network requests.
- Snip text recognition uses a packaged model and runs locally in your browser.
- Reads a page only when you click the toolbar button, use the keyboard shortcut or use the context menu.
- Your data stays in your browser. You can export or delete it at any time.

Text you save belongs to its original authors. PagePocket keeps the source with it, and Markdown exports say so.

## Chrome Web Store: privacy practices tab

- **Single purpose:** Capture parts of web pages the user chooses to save, keep each with its source, and let the user organize, search and export them locally.
- **Permission justifications:**
  - `activeTab`: reads the current page's title, selection, headings, links and code blocks, only after the user clicks the toolbar button, presses its shortcut or uses the context menu.
  - `scripting`: injects the extraction script into that page on demand. There is no always-on content script.
  - `storage`: stores the last-used collection and theme preference. Saved research is kept in IndexedDB, which needs no permission.
  - `contextMenus`: adds the "Save selection to PagePocket" entry for selected text.
- **Host permissions:** none requested.
- **Remote code:** none. All code ships in the package; no remote scripts, `eval` or dynamic code (enforced by a test).
- **Data usage disclosures:** the extension does not collect or transmit any category of user data. All categories: not collected.
- **Certifications to give honestly at submission:** the data is not sold, not used or transferred for purposes unrelated to the single purpose, and not used for creditworthiness or lending.
- **Privacy policy:** host [PRIVACY.md](../PRIVACY.md) at a public URL and link it.

## Firefox Add-ons (AMO)

- **Data collection declaration:** the manifest declares `data_collection_permissions: { required: ["none"] }`, as Mozilla requires for new add-ons.
- **Source code submission:** the package is bundled with esbuild, so reviewers need the source. Run `npm run package:source` and upload `release/pagepocket-source-<version>.zip`.
- **Build instructions for reviewers:**
  ```
  npm install
  GECKO_ID=<the add-on id> npm run build:firefox
  ```
  The output in `dist/firefox` should match the submitted package. Zips from `npm run package:firefox` are deterministic.
- **Notes for reviewers:** there is no account or test data. Open any article, click the toolbar button, choose "Save page" or select text and choose "Save selection", then open the library with "Open library". The extension makes no network requests; `tests/privacy.test.ts` and the `capture` end-to-end suite check this.
- **License:** MIT.

## Screenshots

`docs/screenshots` holds 1280x800 images generated from the real extension with invented content (`npm run screenshots`): `library.png`, `search.png`, `library-dark.png`. `popup.png` is the popup at its native size and must be placed on a 1280x800 canvas before it can be used as a Chrome Web Store screenshot. The Chrome small promotional tile (440x280) has not been made.

## Pre-submission checklist

- [ ] Load `dist/firefox` in Firefox and complete the manual checklist in `docs/BROWSER_SUPPORT.md`.
- [ ] Run `npm run lint:firefox` and fix every error and warning that matters.
- [ ] Choose the real Firefox add-on id and build with `GECKO_ID` set. `npm run package:firefox` refuses the placeholder.
- [ ] Run `npm install` once and commit `package-lock.json`.
- [ ] Test the real toolbar button, keyboard shortcut and context menu on a live page in each browser (automation cannot grant `activeTab`).
- [ ] Try the extension with a screen reader.
- [ ] Publish the privacy policy and a support URL; add them to the listing.
- [ ] Review the listing text against what the extension does that day.
- [ ] Create the Chrome promotional tile and the 1280x800 popup screenshot.
- [ ] Bump the version and update `CHANGELOG.md`.
