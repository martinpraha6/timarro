/**
 * Accept http(s) URLs only — anything else (`javascript:`, `data:`, junk) is
 * dropped.
 *
 * Every URL that ends up in an `src` here arrived inside timeline JSON that the
 * host page fetched from somewhere; none of it is the element's to trust.
 * Resolved against `document.baseURI` so a relative path in the data still
 * points where its author meant it to.
 */
export function safeHttpUrl(url: string): string | null {
  // `new URL('', base)` resolves to the host page itself, which as an image
  // src is a guaranteed broken icon. An empty field means "unset", not "here".
  if (url.trim().length === 0) return null;
  try {
    const parsed = new URL(url, document.baseURI);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
