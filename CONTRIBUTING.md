# Contributing

## Setup

```sh
npm install
npm run check      # typecheck, tests, build both browsers
npm run e2e        # needs Chromium: npx playwright install chromium
```

Load `dist/chrome` as an unpacked extension (see the README). `npm run dev` rebuilds on change.

## Principles

These decide whether a change fits.

1. **Deterministic.** Core behaviour must not depend on a model, a server or a heuristic you cannot explain in a sentence. Do not add an AI feature to make the project sound impressive.
2. **Private by construction.** No network requests, no remote code, no telemetry. `tests/privacy.test.ts` fails if source uses `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `innerHTML` and similar. Do not work around it; if you believe a use is legitimate, raise it in the pull request.
3. **Minimum permissions.** A new permission needs a concrete technical reason, an entry in `docs/ARCHITECTURE.md`, `PRIVACY.md`, `README.md` and `docs/STORE_LISTING.md`, and an updated expectation in `tests/manifest.test.ts` and `scripts/release-checks.mjs`. Expect a lot of questions.
4. **Source integrity.** Every saved item keeps its source. Never present captured content as the user's own.
5. **Untrusted input.** Page content and imported files are hostile until validated. Render stored text with `textContent`, never build markup from it, and only link `http(s)` URLs.
6. **Degrade, do not break.** Extraction that cannot work should produce a smaller result and a warning, not an exception.

## Code style

- Write it as you would want to maintain it. TypeScript, strict mode.
- Comments explain non-obvious browser behaviour, security decisions, compatibility workarounds or architectural constraints. They do not narrate the line below them. No emojis, no motivational comments, no tool or author attributions.
- Prefer a pure function over a clever class. Anything that can run without a browser should be testable without one.
- Keep user-facing wording specific and plain. Errors say what happened and what to try.

## Tests

- Add a test with every behaviour change. A bug fix starts with a test that fails.
- Extraction changes need a fixture in `tests/fixtures/pages.ts` that reproduces the markup. Say in the fixture where the pattern comes from.
- UI changes need to keep `npm run e2e` green, including the accessible-name and contrast audits.
- If you add an extension API call, route it through `src/shared/api.ts` so it works in Firefox, and make it testable with `tests/chrome-stub.ts`.

## Adding site-specific extraction

Prefer generic rules. Only add an adapter in `src/extraction/adapters.ts` when a site needs a different content root; keep it to selecting the root, add a fixture and a test.

## Pull requests

- Keep them focused; explain the reason as well as the change.
- Run `npm run check` and, for anything user-visible, `npm run e2e`.
- Note which browsers you verified. "Not tested in Firefox" is an acceptable answer; claiming it works when you did not run it is not.
- Update the README, `CHANGELOG.md` and relevant docs when behaviour changes. Do not describe features that do not exist.

## Reporting bugs

Include the browser and version, what you did, what you expected and what happened. For extraction problems, the page URL (or a saved copy of the HTML) helps most. Do not include private page content.

Security issues: see [SECURITY.md](SECURITY.md).
