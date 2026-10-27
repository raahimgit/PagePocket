const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "yclid", "igshid",
  "mc_cid", "mc_eid", "_hsenc", "_hsmi", "ref_src",
]);

function isTracking(name: string): boolean {
  return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}

// Identity form of a URL: used for dedupe and comparison, never for display or
// reopening. Returns null for anything that is not http(s).
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.username = "";
  url.password = "";

  // Hash-routed SPAs (#/path, #!/path) use the fragment as the real location.
  if (!url.hash.startsWith("#/") && !url.hash.startsWith("#!")) url.hash = "";

  const names = [...new Set(url.searchParams.keys())];
  let changed = false;
  for (const name of names) {
    if (isTracking(name)) {
      url.searchParams.delete(name);
      changed = true;
    }
  }
  if (changed || url.search) url.searchParams.sort();

  return url.toString();
}

export function withFragment(pageUrl: string, id: string): string | undefined {
  try {
    const url = new URL(pageUrl);
    url.hash = encodeURIComponent(id);
    return url.toString();
  } catch {
    return undefined;
  }
}
