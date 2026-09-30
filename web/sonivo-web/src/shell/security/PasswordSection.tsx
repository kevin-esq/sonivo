import { useT } from '../../i18n'

export function PasswordSection({
  hasPassword,
}: {
  hasPassword?: boolean
}) {
  const { t } = useT()
  if (!hasPassword) return null

  return (
    <section className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('seguridad.passwordTitle')}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {t('seguridad.passwordBody')}
      </p>
    </section>
  )
}
