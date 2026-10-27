import { useEffect, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { exportArrangementLyricsDocument, fetchFeatures, problemDetail, type ArrangementDetail } from '../api/client'
import { useT } from '../i18n'
import { Button } from '../ui/button'

export function LyricsExportPanel({ groupId, arrangement, disabled }: { groupId: string; arrangement: ArrangementDetail; disabled: boolean }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    void fetchFeatures().then(flags => { if (!cancelled) setEnabled(flags.lrc) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  async function download(format: 'ttml' | 'cho') {
    setBusy(true)
    setError(null)
    try {
      const text = await exportArrangementLyricsDocument(groupId, arrangement.id, format)
      const url = URL.createObjectURL(new Blob([text], { type: format === 'ttml' ? 'application/ttml+xml;charset=utf-8' : 'text/plain;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${arrangement.label || 'lyrics'}.${format}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { setError(problemDetail(failure, t)) }
    finally { setBusy(false) }
  }

  function print() {
    const frame = document.createElement('iframe')
    frame.title = t('lyrics.print')
    frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0'
    document.body.append(frame)
    const page = frame.contentDocument
    const view = frame.contentWindow
    if (!page || !view) { frame.remove(); return }
    page.title = arrangement.label
    const style = page.createElement('style')
    style.textContent = '@page{size:auto;margin:20mm}body{font:12pt/1.65 system-ui,sans-serif;color:#18242b;background:white}h1{font-size:22pt;line-height:1.2}pre{font:11pt/1.65 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}h1{break-after:avoid}pre{orphans:3;widows:3}'
    page.head.append(style)
    const heading = page.createElement('h1')
    heading.textContent = arrangement.label
    const source = page.createElement('pre')
    source.textContent = arrangement.chords?.trim() || arrangement.lyrics || ''
    page.body.append(heading, source)
    view.addEventListener('afterprint', () => frame.remove(), { once: true })
    // Construct the print document through text nodes so lyrics never become HTML.
    requestAnimationFrame(() => { view.focus(); view.print() })
  }

  if (!enabled) return null
  return <div className="space-y-3 border-t border-[var(--color-score-line)] pt-4">
    <p className="text-sm text-[var(--color-score-muted)]">{t('lyrics.exportHint')}</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void download('ttml')}><Download className="h-4 w-4" aria-hidden="true" />{t('lyrics.exportTtml')}</Button>
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => void download('cho')}>{t('lyrics.exportChart')}</Button>
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={print}><Printer className="h-4 w-4" aria-hidden="true" />{t('lyrics.print')}</Button>
    </div>
    {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
  </div>
}
