import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { ApiError, lookupArrangementLyrics, type LyricsLookupCandidate } from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'

function lyricsExcerpt(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/, '').trim())
    .filter((line) => line && !/^\[[a-z]+:/i.test(line))
    .slice(0, 3)
    .join('\n')
}

/** A provider candidate never replaces the draft until the Owner chooses it. */
export function LyricsLookupPanel({ groupId, arrangementId, songTitle, songArtist = '', disabled, onChoose }: {
  groupId: string
  arrangementId: string
  songTitle: string
  songArtist?: string
  disabled: boolean
  onChoose: (content: string) => void
}) {
  const { t } = useT()
  const [title, setTitle] = useState(songTitle)
  const [artist, setArtist] = useState(songArtist)
  const [album, setAlbum] = useState('')
  const [candidates, setCandidates] = useState<LyricsLookupCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const requestId = useRef(0)
  useEffect(() => () => { requestId.current += 1 }, [])

  function updateQuery(update: () => void) {
    requestId.current += 1
    update()
    setCandidates([])
    setError(null)
    setBusy(false)
    setSearched(false)
  }

  async function search() {
    if (!title.trim()) return

    const id = ++requestId.current
    setBusy(true)
    setCandidates([])
    setError(null)
    setSearched(true)
    try {
      const result = await lookupArrangementLyrics(groupId, arrangementId, {
        title: title.trim(),
        ...(artist.trim() ? { artist: artist.trim() } : {}),
        ...(album.trim() ? { album: album.trim() } : {}),
      })
      if (requestId.current === id) setCandidates(result)
    } catch (failure) {
      if (requestId.current === id) {
        const notFound = failure instanceof ApiError && (failure.status === 404 || failure.status === 422)
        setError(notFound ? null : t('lyrics.lookupFailed'))
      }
    } finally {
      if (requestId.current === id) setBusy(false)
    }
  }

  function chooseCandidate(candidate: LyricsLookupCandidate) {
    onChoose(candidate.content)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <label className="block space-y-1.5 text-sm font-medium text-ink">
          {t('lyrics.trackTitle')}
          <input className={fieldClass} value={title} maxLength={200} required disabled={disabled || busy} onChange={(event) => updateQuery(() => setTitle(event.target.value))} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <details className="group">
            <summary className="min-h-11 cursor-pointer rounded-xl px-2 py-2 text-sm font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t('lyrics.refineSearch')}</summary>
            <div className="grid gap-4 border-l border-border-subtle py-3 pl-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium text-ink">
                {t('lyrics.artist')}
                <input className={fieldClass} value={artist} maxLength={200} disabled={disabled || busy} onChange={(event) => updateQuery(() => setArtist(event.target.value))} />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-ink">
                {t('lyrics.album')}
                <input className={fieldClass} value={album} maxLength={200} disabled={disabled || busy} onChange={(event) => updateQuery(() => setAlbum(event.target.value))} />
              </label>
            </div>
          </details>
          <Button type="button" onClick={() => void search()} disabled={disabled || busy || !title.trim()}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {busy ? t('lyrics.searching') : t('lyrics.search')}
          </Button>
        </div>
      </div>

      {busy ? (
        <div className="space-y-3 rounded-2xl bg-surface-hover p-4" aria-label={t('lyrics.searching')} aria-live="polite">
          <div className="h-4 w-2/5 animate-pulse rounded bg-border-subtle" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-border-subtle" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-border-subtle" />
        </div>
      ) : candidates.length ? (
        <section className="space-y-3" aria-live="polite" aria-label={t('lyrics.results')}>
          {candidates.map((candidate) => (
            <article key={candidate.recordId} className="space-y-3 rounded-2xl bg-surface-hover p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{candidate.title}</h3>
                  <p className="text-sm text-muted">{candidate.artist}{candidate.album ? ` · ${candidate.album}` : ''} · {Math.floor(candidate.duration / 60)}:{String(Math.round(candidate.duration % 60)).padStart(2, '0')} · {candidate.source}</p>
                </div>
                <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success-ink">{t('lyrics.syncedCandidate')}</span>
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-6 text-muted">{lyricsExcerpt(candidate.content)}</pre>
              <Button type="button" onClick={() => chooseCandidate(candidate)} disabled={disabled}>{t('lyrics.useCandidate')}</Button>
            </article>
          ))}
        </section>
      ) : error ? (
        <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error-ink">{error}</p>
      ) : searched ? (
        <p className="text-sm text-muted" role="status">{t('lyrics.noMatch')}</p>
      ) : (
        <p className="text-sm text-muted">{t('lyrics.lookupHint')}</p>
      )}
    </div>
  )
}
