import { useT } from '../i18n'

/** Explains the song/arrangement boundary using an existing, authorized destination. */
export function SongContentGuide() {
  const { t } = useT()
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-hover/40 px-4 py-3">
      <p className="text-sm leading-relaxed text-muted">{t('workflow.contentGuide')}</p>
    </div>
  )
}
