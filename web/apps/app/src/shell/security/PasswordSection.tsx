import { useT } from '../../i18n'

export function PasswordSection({
  hasPassword,
}: {
  hasPassword?: boolean
}) {
  const { t } = useT()
  if (!hasPassword) return null

  return (
    <section className="security-section space-y-2 rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-ink">{t('security.passwordTitle')}</h2>
      <p className="text-sm text-muted">
        {t('security.passwordBody')}
      </p>
    </section>
  )
}
