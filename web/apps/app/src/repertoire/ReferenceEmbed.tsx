import { parseYouTubeVideoId, youTubeNocookieEmbedUrl } from './youtubeRef'
import { safeExternalResourceUrl } from './resourceUrl'
import { useT } from '../i18n'
import type { ResourceSummary } from '../api/client'

/**
 * T-FX-02 reference embed (ADR-0037).
 *
 * Renders a `youtube-nocookie` iframe for link Resources whose URL parses to
 * a YouTube videoId; anything else keeps the current link rendering. No Data
 * API, no keys, no IFrame API / enablejsapi, no autoplay.
 */

export function ReferenceEmbed({ resource, showLabel = true }: { resource: ResourceSummary; showLabel?: boolean }) {
  const { t } = useT()
  const externalUrl = safeExternalResourceUrl(resource.url)
  const videoId = externalUrl ? parseYouTubeVideoId(externalUrl) : null

  if (videoId == null) {
    return (
      <div className="space-y-1" data-testid="reference-link">
        {showLabel ? <p className="text-sm font-semibold text-ink">{resource.label}</p> : null}
        {resource.url ? (
          externalUrl ? (
            <a
              className="break-all font-medium text-primary-ink no-underline hover:underline"
              href={externalUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {resource.url}
            </a>
          ) : (
            <span className="break-all text-muted">{resource.url}</span>
          )
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full space-y-2" data-testid="reference-embed">
      {showLabel ? <p className="text-sm font-semibold text-ink">{resource.label}</p> : null}
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border-subtle bg-black">
        <iframe
          className="h-full w-full"
          data-testid="reference-iframe"
          src={youTubeNocookieEmbedUrl(videoId)}
          title={`${t('reference.titlePrefix')}${resource.label}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}
