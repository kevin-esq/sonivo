import { useEffect, useState } from 'react'
import { Download, FileText, Upload } from 'lucide-react'
import {
  exportArrangementLrc,
  fetchFeatures,
  importArrangementLrc,
  problemDetail,
  updateArrangement,
  type ArrangementDetail,
  type LrcPreview,
} from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import { FileDropzone } from '../ui/FileDropzone'
import { cn } from '../ui/cn'
import { LyricsLookupPanel } from './LyricsLookupPanel'
import { lyricImportMessage } from './lyricImportMessage'
import { LyricsExportPanel } from './LyricsExportPanel'

/**
 * .lrc import / preview / offset / export (ADR-0050). Import is preview-only: the
 * user reviews the conversion and then applies it through the normal versioned
 * PATCH, so no new write path exists. Only the Owner sees this panel.
 */
export function LrcPanel({
  groupId,
  arrangement,
  onApplied,
  onDraftImported,
  songTitle = '',
}: {
  groupId: string
  arrangement: ArrangementDetail
  onApplied?: (updated: ArrangementDetail) => void
  onDraftImported?: (draft: { lyrics: string; chordTimingJson: string | null }) => void
  songTitle?: string
}) {
  const { t } = useT()
  const [enabled, setEnabled] = useState(false)
  const [text, setText] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [preview, setPreview] = useState<LrcPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)

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
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function onExport() {
    setBusy(true)
    setError(null)
    try {
      const content = await exportArrangementLrc(groupId, arrangement.id)
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${arrangement.label || 'lyrics'}.lrc`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(problemDetail(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) return null

  return (
    <details className="overflow-hidden rounded-2xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] text-[var(--color-score-ink)]" aria-labelledby="lrc-heading" data-testid="lyric-import-options">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 marker:hidden hover:bg-[var(--color-score-hover)] sm:px-6">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary-ink" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span id="lrc-heading" className="block font-semibold">{t(onDraftImported ? 'lrc.editorTitle' : 'lrc.title')}</span>
          <span className="mt-1 block text-sm leading-6 text-[var(--color-score-muted)]">{t('lrc.hint')}</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--color-score-line)] p-5 sm:p-6">

      {onDraftImported ? <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary-ink" role="status">{t('lrc.draftHint')}</p> : null}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{t('lrc.paste')}</span>
        <textarea
          className={cn(
            'min-h-32 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
          )}
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

      <div className="flex flex-wrap items-center gap-3">
        <FileDropzone
          title={t('lrc.chooseFile')}
          description={t('lrc.hint')}
          accept=".lrc,.elrc,.ttml,.xml,.json,.txt,.cho,.chordpro,text/plain,application/ttml+xml,application/xml,text/xml,application/json"
          file={file}
          onFileChange={(selected) => void onFile(selected)}
          disabled={busy}
          icon={FileText}
          compact
          testId="lrc-file-dropzone"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink">{t('lrc.offset')}</span>
          <input
            type="number"
            className="w-24 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-sm text-ink"
            value={offsetMs}
            step={100}
            disabled={busy}
            onChange={(event) => {
              setOffsetMs(Number(event.target.value) || 0)
              setPreview(null)
            }}
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => void onPreview()} disabled={busy || !text.trim()}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('lrc.preview')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void onExport()} disabled={busy}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('lrc.export')}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-hover p-3">
          <p className="text-sm text-muted">
            {t('lrc.summary', { marks: preview.markCount, encoding: preview.encoding })}
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} role="status" className="rounded-lg bg-warning/15 px-2 py-1 text-sm text-ink">
              {t('lrc.warning')}: {lyricImportMessage(warning, t)}
            </p>
          ))}
          {preview.errors.length > 0 ? (
            <ul className="space-y-1 text-sm text-error-ink">
              {preview.errors.map((entry) => (
                <li key={`${entry.line}-${entry.reason}`}>
                  {t('lrc.brokenLine', { line: entry.line })}: {lyricImportMessage(entry.reason, t)}
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-sm text-ink">
            {preview.lyrics}
          </pre>
          <p className="text-sm text-muted">{t('lyrics.precision', { format: (preview.format ?? 'lrc').toUpperCase(), words: preview.wordCount ?? 0 })}</p>
          <p className="text-sm text-muted">{t('lyrics.replacesBody')}</p>
          <Button type="button" onClick={() => void onApply()} disabled={busy || preview.errors.length > 0 || !preview.lyrics.trim()}>
            {t('lrc.apply')}
          </Button>
        </div>
      ) : null}
      <LyricsLookupPanel key={arrangement.id} groupId={groupId} arrangementId={arrangement.id} songTitle={songTitle} disabled={busy} onChoose={content => { setText(content); setFile(null); setPreview(null); setError(null) }} />
      <LyricsExportPanel groupId={groupId} arrangement={arrangement} disabled={busy} />
      </div>
    </details>
  )
}
