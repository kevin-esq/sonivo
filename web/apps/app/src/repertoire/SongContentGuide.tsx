import { Info } from 'lucide-react'
import { useT } from '../i18n'

/** Explains the song/arrangement boundary using an existing, authorized destination. */
export function SongContentGuide() {
  const { t } = useT()
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t('workflow.contentGuide')}</span>
    </p>
  )
}
