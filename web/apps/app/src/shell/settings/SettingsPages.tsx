import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  Clock,
  KeyRound,
  Languages,
  Mail,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import {
  fetchTwoFactorStatus,
  listMyGroups,
  problemDetail,
  updateProfile,
  type GroupSummary,
  type TwoFactorStatus,
} from '../../api/client'
import { useT } from '../../i18n'
import { useTheme } from '../../brand/theme'
import { useAuth } from '../authContext'
import { Button } from '../../ui/button'
import { fieldClass } from '../../ui/field'
import { formatMembershipRole, isOwnerRole } from '../../repertoire/ui'
import { AccountCard } from '../account/AccountCard'
import { AccountRow } from '../account/AccountRow'
import { ProfileHeader } from '../account/ProfileHeader'

const isOwner = (role: string) => String(role).toLowerCase() === 'owner'

function deviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const offset = new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value
    return offset ? `${offset} · ${zone}` : zone
  } catch {
    return ''
  }
}

export function SettingsProfilePage() {
  const { user, onUserChange } = useAuth()
  const { t, lang } = useT()
  const { theme } = useTheme()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    void fetchTwoFactorStatus()
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => {
        // best effort: the row falls back to "Disabled"
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  const roleLabel = (groups ?? []).some((group) => isOwner(group.role))
    ? t('profile.roleOwner')
    : t('profile.roleMember')
  const timeZone = useMemo(() => deviceTimeZone(), [])
  const languageLabel = lang === 'es' ? t('account.spanish') : t('account.english')
  const themeLabel = theme === 'dark' ? t('account.themeDark') : t('account.themeLight')
  const name = user.displayName?.trim() || user.email || ''

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t('profile.title')}</h1>
        <p className="text-muted">{t('profile.subtitle')}</p>
      </header>

      {user.managedByGroupId ? (
        <p
          role="status"
          data-testid="managed-account-notice"
          className="rounded-xl bg-surface-hover px-3 py-2 text-sm text-ink"
        >
          {t('profile.managedNotice')}
        </p>
      ) : null}

      <ProfileHeader user={user} roleLabel={roleLabel} onEdit={() => setEditing(true)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AccountCard title={t('profile.sectionPersonal')}>
            <AccountRow
              icon={UserRound}
              title={t('profile.name')}
              subtitle={name}
              onClick={() => setEditing(true)}
            />
            <AccountRow
              icon={Mail}
              title={t('profile.email')}
              subtitle={user.email ?? '—'}
              onClick={() => setEditing(true)}
            />
            <AccountRow
              icon={Languages}
              title={t('account.language')}
              subtitle={languageLabel}
              to="/cuenta/preferencias"
            />
            <AccountRow icon={Clock} title={t('profile.timezone')} subtitle={timeZone} disabled />
          </AccountCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <AccountCard
              title={t('profile.sectionPlan')}
              action={
                <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                  {t('profile.planPro')}
                </span>
              }
            >
              <p className="px-2 py-1 text-sm text-muted">{t('placeholder.body')}</p>
              <div className="px-2 pt-2">
                <Button variant="secondary" disabled className="w-full">
                  {t('profile.managePlan')}
                </Button>
              </div>
            </AccountCard>

            <AccountCard title={t('profile.sectionUsage')}>
              <AccountRow icon={BarChart3} title={t('profile.groups')} subtitle={t('app.comingSoon')} disabled />
              <AccountRow icon={UserRound} title={t('profile.members')} subtitle={t('app.comingSoon')} disabled />
              <AccountRow icon={MonitorSmartphone} title={t('profile.storage')} subtitle={t('app.comingSoon')} disabled />
            </AccountCard>
          </div>
        </div>

        <div className="space-y-4">
          <AccountCard title={t('security.title')}>
            <AccountRow
              icon={KeyRound}
              title={t('security.passwordLabel')}
              subtitle={t('profile.passwordHint')}
              to="/cuenta/seguridad"
            />
            <AccountRow
              icon={ShieldCheck}
              title={t('profile.twoFactor')}
              subtitle={status?.enabled ? t('profile.twoFactorOn') : t('profile.twoFactorOff')}
              to="/cuenta/seguridad"
            />
            <AccountRow icon={MonitorSmartphone} title={t('profile.sessions')} subtitle={t('app.comingSoon')} disabled />
          </AccountCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <AccountCard title={t('profile.sectionNotifications')}>
              <AccountRow icon={Mail} title={t('profile.emailNotifications')} subtitle={t('app.comingSoon')} disabled />
              <AccountRow icon={Bell} title={t('profile.inAppNotifications')} subtitle={t('app.comingSoon')} disabled />
            </AccountCard>

            <AccountCard title={t('account.preferences')}>
              <AccountRow
                icon={Palette}
                title={t('profile.appearance')}
                subtitle={themeLabel}
                to="/cuenta/preferencias"
              />
              <AccountRow
                icon={Languages}
                title={t('account.language')}
                subtitle={languageLabel}
                to="/cuenta/preferencias"
              />
            </AccountCard>
          </div>
        </div>
      </div>

      {editing ? (
        <EditProfileDialog
          initial={name}
          onClose={() => setEditing(false)}
          onSaved={async (value) => {
            const updated = await updateProfile(value)
            onUserChange(updated)
            setEditing(false)
          }}
        />
      ) : null}
    </div>
  )
}

function EditProfileDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: string
  onClose: () => void
  onSaved: (displayName: string) => Promise<void>
}) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const value = name.trim()
    if (!value) {
      setError(t('profile.nameRequired'))
      inputRef.current?.focus()
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSaved(value)
    } catch (err) {
      setError(problemDetail(err))
      setPending(false)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border-subtle bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-900/40"
    >
      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {t('profile.editTitle')}
        </h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('profile.fullName')}</span>
          <input
            ref={inputRef}
            className={fieldClass}
            value={name}
            maxLength={200}
            disabled={pending}
            onChange={(event) => {
              setName(event.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </label>
        <div role="alert">
          {error ? (
            <p id={`${id}-error`} className="text-sm text-error-ink">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t('profile.cancel')}
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

export function SettingsTeamPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useT()

  useEffect(() => {
    let cancelled = false
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch((err) => {
        if (!cancelled) setError(problemDetail(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{t('team.title')}</h2>
        <p className="text-sm text-slate-500">{t('team.subtitle')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-shell-error">
          {error}
        </p>
      ) : null}

      {groups === null && !error ? (
        <p aria-live="polite" className="text-sm text-slate-500">
          {t('team.loading')}
        </p>
      ) : groups && groups.length > 0 ? (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3"
            >
              <span className="font-medium text-slate-900 dark:text-white">{group.name}</span>
              <Link
                className="text-sm font-semibold text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={`/groups/${group.id}/people`}
              >
                {t('team.viewMembers')}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm">
          {t('team.empty')}
        </div>
      )}
    </div>
  )
}

/**
 * `/cuenta/membresia` — account-level membership. Billing/subscription is not a
 * group-owned concern (ADR-0055) and the group centre no longer hosts a
 * "Membership" tab; this page owns the plan summary and the user's group
 * memberships. No real billing UI yet (ADR firewall: no billing).
 */
export function SettingsMembershipPage() {
  const { t } = useT()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch((err) => {
        if (!cancelled) setError(problemDetail(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t('membership.title')}</h1>
        <p className="text-muted">{t('membership.subtitle')}</p>
      </header>

      <AccountCard
        title={t('membership.planTitle')}
        action={
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
            {t('profile.planPro')}
          </span>
        }
      >
        <p className="px-2 py-1 text-sm text-muted">{t('membership.planNote')}</p>
        <div className="px-2 pt-2">
          <Button variant="secondary" disabled className="w-full">
            {t('profile.managePlan')}
          </Button>
        </div>
      </AccountCard>

      <section aria-labelledby="membresia-groups-heading" className="space-y-3">
        <div className="space-y-1">
          <h2 id="membresia-groups-heading" className="flex items-center gap-2 text-xl font-semibold text-ink">
            <Users className="h-5 w-5 text-primary-ink" aria-hidden="true" />
            {t('membership.groupsTitle')}
          </h2>
          <p className="text-sm text-muted">{t('membership.groupsSubtitle')}</p>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-error-ink">
            {error}
          </p>
        ) : null}

        {groups === null && !error ? (
          <p aria-live="polite" className="text-sm text-muted">
            {t('membership.loading')}
          </p>
        ) : groups && groups.length > 0 ? (
          <ul className="space-y-2">
            {groups.map((group) => (
              <li
                key={group.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{group.name}</p>
                  <p className="text-xs text-muted">
                    {t('membership.roleLabel')}: {formatMembershipRole(group.role, t)}
                    {typeof group.memberCount === 'number'
                      ? ` · ${group.memberCount} ${t('membership.membersLabel').toLowerCase()}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {isOwnerRole(group.role) ? (
                    <Link
                      to={`/groups/${group.id}/people`}
                      className="text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {t('membership.manageMembers')}
                    </Link>
                  ) : null}
                  <Link
                    to={`/groups/${group.id}`}
                    className="text-sm font-semibold text-primary-ink no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t('membership.openGroup')}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-border-subtle bg-surface p-4 text-sm text-muted">
            {t('membership.empty')}
          </div>
        )}
      </section>
    </div>
  )
}
