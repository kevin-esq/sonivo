import { useEffect, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import {
  fetchFeatures,
  importArrangementLrc,
  problemDetail,
  updateArrangement,
  type ArrangementDetail,
  type LrcPreview,
} from '../api/client'
import { useT } from '../i18n'
import { GroupDialog } from '../groups/ui'
import { Button } from '../ui/button'
import { FileDropzone } from '../ui/FileDropzone'
import { cn } from '../ui/cn'
import { LyricsLookupPanel } from './LyricsLookupPanel'
import { LrcLivePreview } from './LrcLivePreview'
import { lyricImportMessage } from './lyricImportMessage'

/**
 * Lyrics import / preview / offset (ADR-0050). Import is preview-only: the
 * user reviews the conversion and then applies it through the normal versioned
 * PATCH, so no new write path exists. Only the Owner sees this panel.
 */
export function LrcPanel({
  groupId,
  arrangement,
  onApplied,
  onDraftImported,
  songTitle = '',
  songArtist = '',
}: {
  groupId: string
  arrangement: ArrangementDetail
  onApplied?: (updated: ArrangementDetail) => void
  onDraftImported?: (draft: { lyrics: string; chordTimingJson: string | null }) => void
  songTitle?: string
  songArtist?: string
}) {
  const { t } = useT()
  const [enabled, setEnabled] = useState(false)
  const [text, setText] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [preview, setPreview] = useState<LrcPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sourceMode, setSourceMode] = useState<'search' | 'file' | 'paste'>('search')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Hidden entirely while the server flag is off (the API would 404 anyway).
  useEffect(() => {
    let cancelled = false
    fetchFeatures()
      .then((flags) => {
        if (!cancelled) setEnabled(flags.lrc)
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onFile(next: File | null) {
    setPreview(null)
    setError(null)
    setFile(next)
    if (!next) {
      setText('')
      setPreview(null)
      setError(null)
      return
    }
    setText('')
    if (next.size > 256 * 1024) { setError(t('lyrics.tooLarge')); return }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await next.arrayBuffer())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      setText(`data:base64,${btoa(binary)}`)
    } catch { setError(t('lyrics.readFailed')) }
    finally { setBusy(false) }
  }

  async function onPreview() {
    if (!text.trim()) return
    if (!text.startsWith('data:base64,') && new TextEncoder().encode(text).length > 256 * 1024) { setError(t('lyrics.tooLarge')); return }
    if (!Number.isInteger(offsetMs) || offsetMs < -2147483648 || offsetMs > 2147483647) { setError(t('lyrics.invalidOffset')); return }
    setBusy(true)
    setError(null)
    try {
      const isBase64 = text.startsWith('data:base64,')
      const result = await importArrangementLrc(groupId, arrangement.id, {
        content: isBase64 ? undefined : text,
        contentBase64: isBase64 ? text.slice('data:base64,'.length) : undefined,
        offsetMs,
      })
      setPreview(result)
    } catch (err) {
      setError(problemDetail(err, t))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function onApply() {
    if (!preview || preview.errors.length || !preview.lyrics.trim()) return
    if (onDraftImported) {
      onDraftImported({ lyrics: preview.lyrics, chordTimingJson: preview.chordTimingJson })
      setPreview(null)
      setText('')
      setFile(null)
      setError(null)
      setSourceMode('search')
      setDialogOpen(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await updateArrangement(groupId, arrangement.id, {
        expectedVersion: arrangement.version,
        lyrics: preview.lyrics,
        chords: preview.lyrics,
        chordTimingJson: preview.chordTimingJson,
      })
      onApplied?.(updated)
      setPreview(null)
      setText('')
      setFile(null)
      setSourceMode('search')
      setDialogOpen(false)
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) return null

  function sourceButton(mode: 'search' | typeof sourceMode, label: string) {
    const selected = sourceMode === mode
    return (
      <button
        type="button"
        aria-pressed={selected}
        disabled={busy}
        onClick={() => setSourceMode(mode)}
        className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 ${selected ? 'bg-surface text-primary-ink shadow-sm' : 'text-muted hover:text-ink'}`}
      >
        {label}
      </button>
    )
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" data-testid="open-lyrics-dialog" onClick={() => setDialogOpen(true)} className="flex w-full items-start gap-3 rounded-2xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] px-5 py-4 text-left text-[var(--color-score-ink)] transition-colors hover:bg-[var(--color-score-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{t('lrc.addLyrics')}</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--color-score-muted)]">{t('lrc.addLyricsHint')}</span>
        </span>
      </button>
      <GroupDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={t('lrc.addLyrics')} description={t('lrc.addLyricsHint')} size="lg" mobileFullscreen testId="lyric-import-options">
        <div className="space-y-5">
        {onDraftImported ? <p className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-primary-ink" role="status">{t('lrc.draftHint')}</p> : null}

        <div role="group" aria-label={t('lrc.inputMethods')} className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-surface-hover p-1">
          {sourceButton('search', t('lrc.searchMethod'))}
          {sourceButton('file', t('lrc.fileMethod'))}
          {sourceButton('paste', t('lrc.pasteMethod'))}
        </div>

        <div hidden={sourceMode !== 'search'}>
          <LyricsLookupPanel
            key={arrangement.id}
            groupId={groupId}
            arrangementId={arrangement.id}
            songTitle={songTitle}
            songArtist={songArtist}
            disabled={busy}
            onChoose={(content) => {
              setText(content)
              setFile(null)
              setPreview(null)
              setError(null)
              setSourceMode('paste')
            }}
          />
        </div>
        {sourceMode === 'file' ? (
          <FileDropzone
            title={t('lrc.chooseFile')}
            description={t('lrc.fileHelp')}
            accept=".lrc,.elrc,.ttml,.xml,.json,.txt,.cho,.chordpro,text/plain,application/ttml+xml,application/xml,text/xml,application/json"
            file={file}
            onFileChange={(selected) => void onFile(selected)}
            disabled={busy}
            icon={FileText}
            compact
            testId="lrc-file-dropzone"
          />
        ) : sourceMode === 'paste' ? (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('lrc.paste')}</span>
              <textarea
                className={cn('min-h-40 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25')}
                value={text.startsWith('data:base64,') ? '' : text}
                placeholder={'[00:12.00]' + t('lrc.placeholderLine')}
                onChange={(event) => {
                  setText(event.target.value)
                  setFile(null)
                  setPreview(null)
                }}
                spellCheck={false}
                disabled={busy}
              />
            </label>
            {text.trim() && !text.startsWith('data:base64,') && !preview ? <LrcLivePreview text={text} arrangementId={arrangement.id} /> : null}
          </div>
        ) : null}

        {sourceMode !== 'search' ? <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink">{t('lrc.offset')}</span>
              <input
                type="number"
                className="min-h-11 w-28 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink"
                value={offsetMs}
                step={100}
                disabled={busy}
                onChange={(event) => {
                  setOffsetMs(Number(event.target.value) || 0)
                  setPreview(null)
                }}
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => void onPreview()} disabled={busy || (sourceMode === 'file' ? !file : !text.trim() || text.startsWith('data:base64,'))}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              {t('lrc.preview')}
            </Button>
        </div> : null}

        {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}

        {preview ? (
          <div className="space-y-3 rounded-2xl bg-surface-hover p-4">
            <div>
              <p className="font-semibold text-ink">{t('lrc.summary', { marks: preview.markCount, encoding: preview.encoding })}</p>
              <p className="mt-1 text-sm text-muted">{t('lyrics.precision', { format: (preview.format ?? 'lrc').toUpperCase(), words: preview.wordCount ?? 0 })}</p>
            </div>
            {preview.warnings.map((warning) => (
              <p key={warning} role="status" className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-ink">{t('lrc.warning')}: {lyricImportMessage(warning, t)}</p>
            ))}
            {preview.errors.length > 0 ? (
              <ul className="space-y-1 text-sm text-error-ink">
                {preview.errors.map((entry) => <li key={`${entry.line}-${entry.reason}`}>{t('lrc.brokenLine', { line: entry.line })}: {lyricImportMessage(entry.reason, t)}</li>)}
              </ul>
            ) : null}
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface px-3 py-2 text-sm text-ink">{preview.lyrics}</pre>
            <p className="text-sm text-muted">{t('lyrics.replacesBody')}</p>
            <Button type="button" onClick={() => void onApply()} disabled={busy || preview.errors.length > 0 || !preview.lyrics.trim()}>{t(onDraftImported ? 'lrc.applyDraft' : 'lrc.apply')}</Button>
          </div>
        ) : null}

        </div>
      </GroupDialog>
    </>
  )
}
