/**
 * Percent-encode the password portion of a Postgres URL if it isn't already
 * a valid WHATWG URL. Supabase passwords commonly contain `&`, `/`, `?`, `#`
 * which break parsing if pasted in raw, and asking field engineers to
 * manually escape characters is a recurring source of pain.
 */
export function normalizeDbUrl(raw: string): string {
  if (!raw) return raw;
  try {
    new URL(raw);
    return raw;
  } catch {
    /* falls through to manual reconstruction */
  }

  const schemeEnd = raw.indexOf('://');
  if (schemeEnd < 0) return raw;
  const scheme = raw.slice(0, schemeEnd + 3);
  const rest = raw.slice(schemeEnd + 3);

  // The hostname can't contain `@`, so the last `@` separates auth from host.
  const lastAt = rest.lastIndexOf('@');
  if (lastAt < 0) return raw;
  const auth = rest.slice(0, lastAt);
  const tail = rest.slice(lastAt);

  const colon = auth.indexOf(':');
  if (colon < 0) return raw;
  const user = auth.slice(0, colon);
  const password = auth.slice(colon + 1);

  return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(password)}${tail}`;
}
