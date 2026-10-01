import { useEffect, useRef, useState } from 'react'
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
import { cn } from '../ui/cn'

/**
 * .lrc import / preview / offset / export (ADR-0050). Import is preview-only: the
 * user reviews the conversion and then applies it through the normal versioned
 * PATCH, so no new write path exists. Only the Owner sees this panel.
 */
export function LrcPanel({
  groupId,
  arrangement,
  onApplied,
}: {
  groupId: string
  arrangement: ArrangementDetail
  onApplied: (updated: ArrangementDetail) => void
}) {
  const { t } = useT()
  const [enabled, setEnabled] = useState(false)
  const [text, setText] = useState('')
  const [offsetMs, setOffsetMs] = useState(0)
  const [preview, setPreview] = useState<LrcPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    // Read as base64 so the server can detect BOM / encoding (Windows-1252 fallback).
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    setText(`data:base64,${btoa(binary)}`)
    setPreview(null)
    setError(null)
  }

  async function onPreview() {
    if (!text.trim()) return
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
      setError(problemDetail(err))
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  async function onApply() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateArrangement(groupId, arrangement.id, {
        expectedVersion: arrangement.version,
        lyrics: preview.lyrics,
        chordTimingJson: preview.chordTimingJson,
      })
      onApplied(updated)
      setPreview(null)
      setText('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(problemDetail(err))
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
      setError(problemDetail(err))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) return null

  return (
    <section className="space-y-3" aria-labelledby="lrc-heading">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary-ink" aria-hidden="true" />
        <h2 id="lrc-heading" className="font-semibold">
          {t('lrc.title')}
        </h2>
      </div>
      <p className="text-sm text-slate-500">{t('lrc.hint')}</p>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">{t('lrc.paste')}</span>
        <textarea
          className={cn(
            'min-h-32 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25',
          )}
          value={text.startsWith('data:base64,') ? '' : text}
          placeholder={'[00:12.00]' + t('lrc.placeholderLine')}
          onChange={(event) => {
            setText(event.target.value)
            setPreview(null)
          }}
          spellCheck={false}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".lrc,text/plain"
          onChange={onFile}
          aria-label={t('lrc.chooseFile')}
          className="text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-700">{t('lrc.offset')}</span>
          <input
            type="number"
            className="w-24 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-sm text-ink"
            value={offsetMs}
            step={100}
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
          <p className="text-sm text-slate-600">
            {t('lrc.summary', { marks: preview.markCount, encoding: preview.encoding })}
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} role="status" className="text-sm text-warning">
              {t('lrc.warning')}: {warning}
            </p>
          ))}
          {preview.errors.length > 0 ? (
            <ul className="space-y-1 text-sm text-error-ink">
              {preview.errors.map((entry) => (
                <li key={`${entry.line}-${entry.reason}`}>
                  {t('lrc.brokenLine', { line: entry.line })}: {entry.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-sm text-ink">
            {preview.lyrics}
          </pre>
          <Button type="button" onClick={() => void onApply()} disabled={busy}>
            {t('lrc.apply')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
