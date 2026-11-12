'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, CreditCard, LockKeyhole, Palette, Users, UserRound } from 'lucide-react'
import { listMyGroups, type GroupSummary } from '../../api/client'
import { useT } from '../../i18n'
import { AppLink } from '../../routing/AppLink'
import { routes } from '../../routing/routes'
import { AccountSettingsLayout } from './AccountSettingsLayout'

export function AccountOverviewPage({ displayName }: { displayName: string }) {
  const { t } = useT()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void listMyGroups().then((result) => {
      if (active) setGroups(result)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => { active = false }
  }, [])

  const memberCount = groups?.some((group) => group.memberCount == null)
    ? null
    : groups?.reduce((total, group) => total + (group.memberCount ?? 0), 0)

  return (
    <AccountSettingsLayout active="overview" title={t('account.overviewGreeting', { name: displayName })} description={t('account.overviewSubtitle')}>
      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2" aria-label={t('account.overviewSummary')}>
          <OverviewCard icon={Users} label={t('account.groups')} value={failed ? '—' : groups === null ? '…' : String(groups.length)} />
          <OverviewCard icon={UserRound} label={t('account.groupMembers')} value={failed ? '—' : memberCount === undefined ? '…' : memberCount === null ? '—' : String(memberCount)} />
        </section>

        {failed ? <p role="status" className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-muted">{t('account.overviewLoadFailed')}</p> : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">{t('account.quickActions')}</h2>
            <p className="text-sm text-muted">{t('account.quickActionsHint')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickAction to={routes.accountProfile} icon={UserRound} label={t('account.profile')} detail={t('account.actionProfile')} />
            <QuickAction to={routes.accountSecurity} icon={LockKeyhole} label={t('account.security')} detail={t('account.actionSecurity')} />
            <QuickAction to={routes.accountPreferences} icon={Palette} label={t('account.preferences')} detail={t('account.actionPreferences')} />
            <QuickAction to={routes.accountMembership} icon={CreditCard} label={t('account.membership')} detail={t('account.actionMembership')} />
          </div>
        </section>
      </div>
    </AccountSettingsLayout>
  )
}

function OverviewCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex min-h-28 items-center gap-4 rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      </div>
    </div>
  )
}

function QuickAction({ to, icon: Icon, label, detail }: { to: string; icon: typeof Users; label: string; detail: string }) {
  return (
    <AppLink to={to} className="group flex min-h-24 items-center gap-3 rounded-2xl border border-border-subtle bg-surface p-4 text-ink no-underline shadow-sm transition-colors hover:border-primary/40 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="mt-0.5 block text-sm text-muted">{detail}</span></span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </AppLink>
  )
}
