# Privacy

*Applies to ContextLens 0.1.0.*

ContextLens runs entirely in your browser. Its developers receive no data from it, because it never sends any.

## What it stores, and where

- **Items you save:** the page URL, canonical URL if the page declares one, page title, the text, code, heading or link you chose to save, the time you saved it, the heading it appeared under, plus any tags, notes and collection names you add. Stored in the browser's IndexedDB for this extension, on your device.
- **One setting:** the id of the collection you used last, in the extension's local storage.

Nothing else is stored. In particular, ContextLens does not record the pages you visit. A page is read only when you click the toolbar button, press its shortcut, or use the context menu, and what was read is discarded unless you press a save button.

## What it sends

Nothing. The extension makes no network requests, loads no remote code and includes no analytics, telemetry, crash reporting, advertising or third-party services. This is checked by an automated scan of the source and by an end-to-end test that records network traffic.

Snip text recognition runs locally using OCR code and English language data packaged with the extension. The recognized text is shown for review; it is saved only when you choose **Save extracted text**.

Data leaves your browser only when you choose **Export JSON backup** or **Export Markdown**, which write a file to your computer. What you do with that file is up to you.

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Read the current page, only after you act. |
| `scripting` | Run the extraction script on that page. |
| `storage` | Remember the last-used collection and theme preference. |
| `contextMenus` | Add "Save selection to ContextLens". |

ContextLens requests no access to all sites, your history, bookmarks, cookies, downloads or network traffic.

## Control and deletion

You can delete any item, note or collection in the library, export everything at any time, and import a backup. Removing the extension normally removes its stored data from the browser, but browsers differ, so export a backup first if you want to keep it. Your browser may also offer to clear extension data separately.

## Captured content

Text you save comes from other people's pages and remains theirs. ContextLens keeps the source URL and title with every item, and Markdown exports state that the content belongs to its original authors, so that captured material is not mistaken for your own writing. You are responsible for how you use what you save.

## Changes

Any change that adds data collection or a network request would be a material change; it would be recorded in the changelog and this file before release. Questions or concerns can be raised by opening an issue in the project repository.
