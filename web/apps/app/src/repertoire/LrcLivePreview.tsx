import { useMemo } from 'react'
import { Lrc } from 'lrc-kit'
import { useT } from '../i18n'
import { useAudioPlayer } from './AudioPlayerContext'

/**
 * Live preview of the LRC text the user is pasting. Parsing runs client-side
 * with the MIT `lrc-kit` parser so the user sees the timed lines — including
 * repeated `[mm:ss.xx][mm:ss.xx]` timestamps and `[ti:]`/`[ar:]` metadata —
 * before asking the server to convert them. When the audio for this
 * arrangement is playing, the current line is highlighted.
 */

/** Metadata tags shown as a compact summary row. */
const META_KEYS = ['ti', 'ar', 'al', 'by', 'au', 'length'] as const

function formatTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

export function LrcLivePreview({ text, arrangementId }: { text: string; arrangementId: string }) {
  const { t } = useT()
  const { currentTrack, isPlaying, progress } = useAudioPlayer()

  const parsed = useMemo(() => {
    const empty = { info: [] as Array<[string, string]>, lines: [] as Array<{ time: number; text: string }> }
    if (!text.trim() || text.startsWith('data:base64,')) return empty
    try {
      const lrc = Lrc.parse(text)
      const info: Array<[string, string]> = []
      for (const key of META_KEYS) {
        const value = lrc.info[key]
        if (value) info.push([key.toUpperCase(), value])
      }
      const lines = lrc.lyrics
        .map((line) => ({ time: line.timestamp, text: line.content }))
        .sort((left, right) => left.time - right.time)
      return { info, lines }
    } catch {
      return empty
    }
  }, [text])

  const follows = isPlaying && currentTrack?.arrangementId === arrangementId
  let activeIndex = -1
  if (follows) {
    parsed.lines.forEach((line, index) => {
      if (line.time <= progress) activeIndex = index
    })
  }

  if (parsed.lines.length === 0 && parsed.info.length === 0) return null

  return (
    <div className="space-y-1 rounded-xl border border-border-subtle bg-surface p-3" data-testid="lrc-live-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('lrc.livePreviewTitle')}</p>
        {parsed.lines.length > 0 ? (
          <span className="text-xs text-muted">{t('lrc.livePreviewCount', { count: parsed.lines.length })}</span>
        ) : null}
      </div>
      {parsed.info.length > 0 ? (
        <p className="text-xs text-muted" data-testid="lrc-live-preview-meta">
          {t('lrc.livePreviewMeta', { items: parsed.info.map(([key, value]) => `${key}: ${value}`).join(' · ') })}
        </p>
      ) : null}
      {parsed.lines.length === 0 ? (
        <p className="text-sm text-muted">{t('lrc.livePreviewEmpty')}</p>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs">
          {parsed.lines.map((line, index) => (
            <li
              key={`${index}-${line.time}`}
              className={`rounded px-1.5 py-0.5 ${index === activeIndex ? 'bg-primary/20 font-semibold text-primary-ink' : 'text-ink'}`}
            >
              <span className="text-muted">{formatTimestamp(line.time)}</span>{' '}
              <span>{line.text || '·'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
