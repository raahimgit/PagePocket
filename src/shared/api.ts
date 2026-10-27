// Firefox exposes promise-based APIs on `browser`; Chrome MV3 does the same on
// `chrome`. Resolving lazily keeps this one import working in both browsers
// and lets tests install a fake without import-order tricks.
export const api: typeof chrome = new Proxy({} as typeof chrome, {
  get(_target, property) {
    const root = globalThis as unknown as Record<string, Record<PropertyKey, unknown> | undefined>;
    return (root.browser ?? root.chrome)?.[property];
  },
});
