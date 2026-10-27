# Changelog

## 0.1.0 (unreleased)

First pre-release. Not published to any store.

### Added

- Capture pages, selections, code blocks (with language), headings and links, each with its source URL, canonical URL, title, capture time and nearest heading.
- Collections, manual tags, and notes on items and collections.
- Local search over titles, content, tags, URLs and notes, with `tag:`, `type:`, `site:` and phrase queries and result highlighting.
- Markdown export per collection, complete JSON export, and validated import with preview and merge or replace modes.
- Context-menu save, popup, library page, keyboard shortcuts and a toolbar shortcut.
- Chrome (service worker) and Firefox (event page) builds; Firefox manifest declares that no data is collected.
- Deterministic packaging that refuses a Firefox build with a placeholder add-on id.

### Known gaps

- The Firefox build has not been loaded in Firefox, and `web-ext lint` has not been run.
- The real `activeTab` grant and the context-menu click are not covered by automated tests.
