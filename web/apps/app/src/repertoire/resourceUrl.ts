/** Return a normalized external resource URL only when it is safe to navigate to or load. */
export function safeExternalResourceUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (
    trimmed.length > 2000 ||
    /\s|\\/.test(trimmed) ||
    !/^https?:\/\/[^/?#]+/i.test(trimmed)
  ) {
    return null
  }

  try {
    const parsed = new URL(trimmed)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.hostname.length === 0 ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null
    }

    return parsed.href
  } catch {
    return null
  }
}
