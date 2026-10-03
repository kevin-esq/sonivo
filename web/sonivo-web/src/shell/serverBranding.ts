import { getGroupBranding, type GroupBranding } from '../api/client'

export type ServerBranding = {
  accentHex: string | null
  secondaryHex: string | null
  onPrimary: string | null
  onSecondary: string | null
  coverKind: string | null
  coverValue: string | null
  displayName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  loginHeadline: string | null
  welcomeText: string | null
  themeDefault: string | null
  showSonivoCredit: boolean
}

/** Loads server-side branding best-effort; returns null when unavailable/flag off. */
export async function loadServerBranding(groupId: string): Promise<ServerBranding | null> {
  try {
    const branding: GroupBranding = await getGroupBranding(groupId)
    return {
      accentHex: branding.accentHex,
      secondaryHex: branding.secondaryHex,
      onPrimary: branding.onPrimary,
      onSecondary: branding.onSecondary,
      coverKind: branding.coverKind,
      coverValue: branding.coverValue,
      displayName: branding.displayName,
      logoUrl: branding.logoUrl,
      bannerUrl: branding.bannerUrl,
      loginHeadline: branding.loginHeadline,
      welcomeText: branding.welcomeText,
      themeDefault: branding.themeDefault,
      showSonivoCredit: branding.showSonivoCredit,
    }
  } catch {
    return null
  }
}

/**
 * Scoped brand tokens (ADR-0054). Applied to the group shell only so a group's
 * identity never leaks to `:root` or other groups. Values fall back to CSS
 * defaults when the group did not set them.
 */
export function brandTokenStyle(branding: ServerBranding | null): Record<string, string> {
  const tokens: Record<string, string> = {}
  if (!branding) return tokens
  if (branding.accentHex) {
    tokens['--brand-primary'] = branding.accentHex
    tokens['--group-accent'] = branding.accentHex
    tokens['--brand-on-primary'] = branding.onPrimary ?? '#ffffff'
  }
  if (branding.secondaryHex) {
    tokens['--brand-secondary'] = branding.secondaryHex
    tokens['--brand-on-secondary'] = branding.onSecondary ?? '#0f172a'
  }
  return tokens
}

function setMeta(name: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setLink(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = rel
    document.head.appendChild(tag)
  }
  tag.href = href
}

/**
 * Applies per-group identity to the document: title, theme-color, favicon and the
 * dynamic web app manifest (/g/{slug}/manifest.webmanifest). No-op for the pieces
 * the group did not configure.
 */
export function applyDocumentBranding(input: {
  name: string
  slug: string | null
  accentHex: string | null
  logoUrl: string | null
}): void {
  document.title = `${input.name} · Sonivo`
  if (input.accentHex) {
    setMeta('theme-color', input.accentHex)
  }
  if (input.logoUrl) {
    setLink('icon', input.logoUrl)
  }
  if (input.slug) {
    setLink('manifest', `/g/${encodeURIComponent(input.slug)}/manifest.webmanifest`)
  }
}
