import { parseYouTubeVideoId, youTubeNocookieEmbedUrl } from './youtubeRef'
import type { ResourceSummary } from '../api/client'

/**
 * T-FX-02 reference embed (ADR-0037).
 *
 * Renders a `youtube-nocookie` iframe for link Resources whose URL parses to
 * a YouTube videoId; anything else keeps the current link rendering. No Data
 * API, no keys, no IFrame API / enablejsapi, no autoplay.
 */


export function ReferenceEmbed({ resource }: { resource: ResourceSummary }) {
  const videoId = parseYouTubeVideoId(resource.url)

  if (videoId == null) {
    return (
      <div className="space-y-1" data-testid="reference-link">
        <p className="text-sm font-semibold text-neutral-dark">{resource.label}</p>
        {resource.url ? (
          <a
            className="break-all font-medium text-primary no-underline hover:underline"
            href={resource.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {resource.url}
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="reference-embed">
      <p className="text-sm font-semibold text-neutral-dark">{resource.label}</p>
      <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-black">
        <iframe
          className="h-full w-full"
          data-testid="reference-iframe"
          src={youTubeNocookieEmbedUrl(videoId)}
          title={`Referencia: ${resource.label}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}
