// tenancy/safeNextPath.ts
/** Internal app paths only. Rejects absolute URLs, //host, backslashes and loops back to /login or /register. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null;
  }
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (/^\/(login|register)(\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
