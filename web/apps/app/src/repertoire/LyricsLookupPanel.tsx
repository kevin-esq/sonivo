import { useState } from 'react'
import { Search } from 'lucide-react'
import { ApiError, lookupArrangementLyrics, type LyricsLookupCandidate } from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'

/** A provider candidate never replaces the draft until the Owner chooses it. */
export function LyricsLookupPanel({ groupId, arrangementId, songTitle, disabled, onChoose }: {
  groupId: string
  arrangementId: string
  songTitle: string
  disabled: boolean
  onChoose: (content: string) => void
}) {
  const { t } = useT()
  const [title, setTitle] = useState(songTitle)
  const [artist, setArtist] = useState('')
  const [duration, setDuration] = useState('')
  const [candidate, setCandidate] = useState<LyricsLookupCandidate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search() {
    setBusy(true)
    setError(null)
    setCandidate(null)
    try {
      setCandidate(await lookupArrangementLyrics(groupId, arrangementId, { title: title.trim(), artist: artist.trim(), ...(duration ? { duration: Number(duration) } : {}) }))
    } catch (failure) {
      setError(t(failure instanceof ApiError && (failure.status === 404 || failure.status === 422) ? 'lyrics.noMatch' : 'lyrics.lookupFailed'))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 border-t border-[var(--color-score-line)] pt-4">
      <p className="text-sm text-[var(--color-score-muted)]">{t('lyrics.lookupHint')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">{t('lyrics.trackTitle')}<input className={fieldClass} value={title} maxLength={200} disabled={disabled || busy} onChange={event => { setTitle(event.target.value); setCandidate(null) }} /></label>
        <label className="space-y-1 text-sm">{t('lyrics.artist')}<input className={fieldClass} value={artist} maxLength={200} disabled={disabled || busy} onChange={event => { setArtist(event.target.value); setCandidate(null) }} /></label>
        <label className="space-y-1 text-sm">{t('lyrics.duration')}<input className={fieldClass} type="number" min={1} max={3600} step={1} value={duration} disabled={disabled || busy} onChange={event => { setDuration(event.target.value); setCandidate(null) }} /></label>
      </div>
      <Button type="button" variant="secondary" onClick={() => void search()} disabled={disabled || busy || !title.trim() || !artist.trim() || (duration !== '' && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 3600))}>
        <Search className="h-4 w-4" aria-hidden="true" />{t(busy ? 'lyrics.searching' : 'lyrics.search')}
      </Button>
      {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
      {candidate ? <div className="space-y-2 text-sm">
        <p role="status">{t('lyrics.candidate', { title: candidate.title, artist: candidate.artist, source: candidate.source })}</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[var(--color-score-muted)]">{candidate.content}</pre>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => { onChoose(candidate.content); setCandidate(null) }}>{t('lyrics.useCandidate')}</Button>
      </div> : null}
    </div>
  )
}
