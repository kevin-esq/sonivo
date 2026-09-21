/**
 * T-FX-02 YouTube reference helpers (ADR-0037).
 *
 * Allowlist-parse of YouTube watch / short / embed URLs to a bare videoId.
 * Unparseable URLs return null so callers keep the current link rendering.
 * No Data API, no keys, no IFrame API, no search/extraction.
 */

export const YOUTUBE_NOCOOKIE_EMBED_HOST = 'https://www.youtube-nocookie.com'

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

function cleanId(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  const id = candidate.trim()
  return VIDEO_ID_PATTERN.test(id) ? id : null
}

/**
 * Extract the 11-char YouTube videoId from watch, youtu.be, embed and
 * shorts URLs. Returns null when the URL is not a parseable YouTube link.
 */
export function parseYouTubeVideoId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'youtu.be') {
    // https://youtu.be/{id} (ignore extra path segments / query)
    return cleanId(url.pathname.split('/').filter(Boolean)[0])
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const path = url.pathname
    if (path === '/watch') {
      return cleanId(url.searchParams.get('v'))
    }
    const segments = path.split('/').filter(Boolean)
    if (segments[0] === 'embed' || segments[0] === 'shorts') {
      return cleanId(segments[1])
    }
    return null
  }

  if (host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] === 'embed') {
      return cleanId(segments[1])
    }
    return null
  }

  return null
}

/** Privacy-enhanced embed URL. Never adds autoplay or enablejsapi. */
export function youTubeNocookieEmbedUrl(videoId: string): string {
  return `${YOUTUBE_NOCOOKIE_EMBED_HOST}/embed/${videoId}`
}

export type YouTubeReferenceLike = {
  purpose: string
  kind: string
  url: string | null
}

/** True for link Resources with purpose=reference and a parseable videoId. */
export function isYouTubeReference(resource: YouTubeReferenceLike): boolean {
  return (
    resource.purpose === 'reference' &&
    resource.kind === 'link' &&
    parseYouTubeVideoId(resource.url) != null
  )
}
