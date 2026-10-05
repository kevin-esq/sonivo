// tenancy/safeNextPath.ts
/** Solo rutas internas de la app. Rechaza URLs absolutas, //host, backslashes y bucles a /login o /register. */
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
