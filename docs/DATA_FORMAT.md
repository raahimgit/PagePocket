# Export format

`schemaVersion: 1`. One JSON object:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-10-06T08:00:00.000Z",
  "collections": [{ "id": "…", "name": "PostgreSQL Research", "description": "optional", "createdAt": "…", "updatedAt": "…" }],
  "items": [{
    "id": "…",
    "type": "page | excerpt | code | heading | link",
    "content": "captured text",
    "source": { "url": "https://…", "pageTitle": "…", "canonicalUrl": "optional" },
    "capturedAt": "2026-10-05T10:00:00.000Z",
    "tags": ["postgresql"],
    "collectionIds": ["…"],
    "language": "optional",
    "headingContext": "optional",
    "targetUrl": "optional: link destination or heading anchor"
  }],
  "notes": [{ "id": "…", "target": { "kind": "item | collection", "id": "…" }, "body": "…", "createdAt": "…", "updatedAt": "…" }]
}
```

Output is sorted (items by capture time, notes by creation time, collections by name), so two exports of the same data are identical apart from `exportedAt` and diff cleanly.

## Import validation

A file is rejected as a whole, with a list of problems (capped at 50), if any of these fail:

- not JSON, not an object, missing or non-integer `schemaVersion`, or a version newer than the build understands
- an array is missing or over its limit (100,000 items, 200,000 notes, 5,000 collections); file over 50 MB
- a field has the wrong type, is empty where required, or is over its length limit (content 200,000 characters, titles 1,000, URLs 4,096, notes 10,000, names 100)
- an id is empty, over 100 characters, or contains anything but letters, digits, `-` and `_`; duplicate ids within a list
- an item has no `source`, or `source.url` is not `http`, `https` or `file`
- `targetUrl` or `canonicalUrl` is not `http` or `https`
- a date is not ISO 8601; a tag is not valid after normalization (more than 30 tags per item)

Accepted data is rebuilt field by field, so unknown properties (including `__proto__` payloads) never reach storage. Tags and dates are normalized. References to collections, items or collections that do not exist in the file are dropped and reported as warnings.

## Import modes

- **Merge** never overwrites. A record whose id already exists is skipped. An incoming item with the same page, type and content as an existing one is merged into it (tags and collections are unioned) and its notes follow. Collections are matched by name, case-insensitively, so names stay unique. Importing the same file twice changes nothing the second time.
- **Replace** deletes all current data and loads the file. The preview states exactly what will be deleted, and the browser asks for confirmation.

Both modes are applied in a single IndexedDB transaction: a failure leaves existing data untouched.
