# Architecture

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| Background | `src/background` | Injects the content script on demand, handles the context-menu save. |
| Content script | `src/content` | Runs in the page's isolated world, reads the DOM, returns plain data. Never writes to storage. |
| Extraction | `src/extraction` | Pure functions over `Document`/`Selection`. Testable without a browser. |
| Storage | `src/storage` | `Repository` interface, IndexedDB implementation, `storage.local` settings. |
| Library | `src/library` | Domain rules over a `Repository`: save, dedupe, collections, notes, validation. |
| Search | `src/search` | Tokenizer, query parser, in-memory inverted index, result highlighting. |
| Portability | `src/portability` | Markdown rendering, strict import validation, pure merge/replace planner. See `DATA_FORMAT.md`. |
| Popup | `src/popup` | Intentional capture flow for the current page, selection, or rectangular snip. Asks the background to capture; saves through `Library`. |
| Options | `src/options` | Library browser. `index.ts` wiring and rendering, `items.ts` item and note cards, `data-tools.ts` export/import, `ui.ts` focus and live-region helpers. |
| Shared | `src/shared` | Data model, message protocol, CSS. |

## Decisions

- **No persistent content scripts.** The content script is injected with `scripting.executeScript` after a user gesture, using `activeTab`. This means no host permissions, no per-page overhead, and no scripts running on pages the user never captures from.
- **The content script returns data and never persists.** Whichever context asked for the capture (the popup, or the background for the context menu) saves through `Library`. Keeping the page-side code free of storage makes extraction unit-testable.
- **IIFE bundles, per-browser manifest.** esbuild emits classic scripts. `scripts/manifest.mjs` builds the manifest: Chrome gets `background.service_worker`; Firefox gets `background.scripts`, a gecko ID, and the required `data_collection_permissions: none` declaration. See `BROWSER_SUPPORT.md`.
- **One API entry point.** Everything goes through `shared/api.ts`, which resolves to `browser` (Firefox) or `chrome` (Chrome MV3) lazily. Both are promise-based in MV3, so there is no polyfill and no doubt about Firefox's `chrome.*` behaviour. Tests install a fake with `tests/chrome-stub.ts`.
- **IndexedDB for items, `storage.local` for settings only.** All extension pages share one IndexedDB origin, so popup, options and background each open the `Library` directly instead of proxying through messages. Transactions keep concurrent writers consistent. The tradeoff: there is no single owner process, so any in-memory cache (the search index) is rebuilt per context.
- **Cascades live in the repository, not the library.** Deleting an item or collection removes dependent notes and memberships in one transaction, so a crash cannot leave orphans. A shared contract test enforces this for every implementation.
- **Dedupe key** is normalized source URL + type + content + target URL. Re-saving the same thing returns the existing item and adds it to the chosen collection.

## Permissions

- `activeTab`: read the current tab only after the user clicks the toolbar button or a context-menu entry.
- `scripting`: inject the extraction script on demand.
- `storage`: remember the last-used collection and theme (`storage.local`). Saved research lives in IndexedDB, which needs no permission.
- `contextMenus`: the "Save selection to PagePocket" entry.

Rectangular snips use a page overlay plus the browser visible-tab screenshot API. Each selected viewport rectangle is cropped, and a session's rectangles are composed into one two-column collage before it is stored. The single **Snip or extract text** action opens a review tab after capture. OCR runs locally using the packaged Tesseract.js worker, WASM core, and traineddata; recognized text is shown for review and can be saved as a separate source-linked excerpt. No OCR data is sent over the network. Browser restrictions still apply: extension pages, protected viewers, cross-origin limitations, and full-page capture are not universally available. Collages are stored locally as first-class screenshot items alongside excerpts, with tags and notes.

Export uses a Blob download from the options page and import reads a user-chosen file, so neither needs the `downloads` permission or any file access permission.

There are no host permissions.

## Search

- **Index:** an immutable in-memory inverted index built from items and their notes. Fields and weights: title 5, tags 4, notes 2.5, heading/language/type 2, content 1.5, URL 1. Scores use a saturating term frequency and an inverse document frequency. Ties break by capture date, then id, so results are deterministic.
- **Tokenizing:** Unicode words, accent- and case-folded. Identifiers are split too (`getUserById` also indexes `get`, `user`, `id`), which matters for code.
- **Query syntax:** bare words are ANDed and the last one also matches as a prefix; `"exact phrase"`; `tag:`, `type:`, `site:` filters. A query that contains no words or filters lists everything, newest first.
- **Lifecycle:** each `Library` instance caches one index and drops it on any mutation. Other extension contexts are told through a `BroadcastChannel` so they rebuild lazily and the options page re-renders.
- **Cost:** a rebuild is a full pass. Measured on a laptop-class machine with prose-like text: about 0.3 s for 1,000 items (2.7 MB) and 1.4 s for 5,000 items (13 MB); queries take a few milliseconds. Beyond a few thousand items, incremental updates would be the next step.
- **Not indexed:** collection names and collection-level notes.

## Tags

Normalized to lowercase, whitespace and punctuation collapsed to `-`, a leading `#` stripped, 40 characters maximum, 30 per item. Invalid tags are rejected with an error rather than silently altered beyond that normalization.

## UI conventions

- **Focus survives re-rendering.** The options page rebuilds its DOM after every change. Interactive elements carry a `data-key`; before a render the focused key and any unsent text in keyed fields are recorded and restored afterwards, so keyboard users keep their place and a half-written note is not lost when something else changes. Actions can also request a destination (editing a note focuses its editor; deleting an item focuses the results heading).
- **Announcements.** One `role="status"` region per page reports results and outcomes ("Tags added.", "Removed from Alpha.", "3 results"). Errors use the same region with error styling.
- **Keyboard.** Options: `/` focuses search, `Esc` clears it, `Enter` in a tag field adds tags, `Ctrl/Cmd+Enter` saves a note, `Esc` cancels note editing. Popup: opens focused on the primary action (Save selection when text is selected, otherwise Save page); `Enter` in the tags field saves it. Toolbar shortcut: `Alt+Shift+L` (`_execute_action`; users can rebind it in the browser).
- **Colour.** Light and dark themes from CSS variables. Body text and controls were measured at 4.5:1 or better and control borders at 3:1 or better in both schemes.
- **Links.** Source links open in a new tab with `noopener noreferrer` and a screen-reader-only "opens in a new tab" note; non-http(s) URLs are never linked.

## Testing layers

- **Unit and integration (`npm test`, vitest):** library rules, search, import/export, validation, extraction against fixture pages (jsdom), manifest and permission assertions, a static privacy scan of `src`, failure paths (storage full, injection refused, extraction throws).
- **Browser (`npm run e2e`, Playwright + Chromium):** the built extension is loaded and driven. `ux` covers keyboard, focus, audits and the popup save flow; `capture` runs the real injection and extraction chain on fixture pages with a test-only build that adds host permissions, and asserts that no network request leaves the extension; `portability` covers export, import and replace.
