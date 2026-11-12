'use client'

import { routes } from '../../routing/routes'
import { Mail, PencilLine, UserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  listMyGroups,
  problemDetail,
  updateProfile,
  type CurrentUser,
  type GroupSummary,
} from '../../api/client'
import { useT } from '../../i18n'
import { AppLink } from '../../routing/AppLink'
import { Button } from '../../ui/button'
import { fieldClass } from '../../ui/field'
import { ProfileHeader } from '../account/ProfileHeader'
import { AccountCard } from '../account/AccountCard'
import { AccountSettingsLayout } from '../account/AccountSettingsLayout'
import { PlansPage } from '../../plans/PlansPage'

const isOwner = (role: string) => String(role).toLowerCase() === 'owner'

export function SettingsProfilePage({ user, onUserChange }: { user: CurrentUser; onUserChange: (user: CurrentUser) => void }) {
  const { t } = useT()
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [groupsFailed, setGroupsFailed] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setGroups(null)
    setGroupsFailed(false)
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([])
          setGroupsFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  const roleLabel = groupsFailed
    ? t('profile.roleUnknown')
    : (groups ?? []).some((group) => isOwner(group.role))
      ? t('profile.roleOwner')
      : t('profile.roleMember')
  const name = user.displayName?.trim() || user.email || ''

  return (
    <AccountSettingsLayout active="profile" title={t('profile.title')} description={t('profile.subtitle')}>
      <div className="account-profile-page space-y-6">

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

      <AccountCard title={t('profile.information')} className="p-0">
        <dl className="divide-y divide-border-subtle">
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <dt className="text-xs font-medium text-muted">{t('profile.fullName')}</dt>
              <dd className="truncate text-sm font-semibold text-ink">{name}</dd>
            </div>
            <Button variant="ghost" onClick={() => setEditing(true)} aria-label={t('profile.edit')}><PencilLine className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 sm:px-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-ink"><Mail className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              <dt className="text-xs font-medium text-muted">{t('profile.email')}</dt>
              <dd className="truncate text-sm font-semibold text-ink">{user.email || '—'}</dd>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${user.emailConfirmed ? 'bg-success/10 text-success-ink' : 'bg-warning/10 text-warning-ink'}`}>
              {t(user.emailConfirmed ? 'profile.emailVerified' : 'profile.emailUnverified')}
            </span>
          </div>
        </dl>
      </AccountCard>

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
    </AccountSettingsLayout>
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
      setError(problemDetail(err, t))
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
        if (!cancelled) setError(problemDetail(err, t))
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
              <AppLink
                className="text-sm font-semibold text-shell-link no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={routes.groupPeople(group.id)}
              >
                {t('team.viewMembers')}
              </AppLink>
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

/** Billing and plan limits are managed here at account scope. */
export function SettingsMembershipPage() {
  const { t } = useT()
  return (
    <AccountSettingsLayout active="membership" title={t('membership.title')} description={t('membership.subtitle')}>
      <PlansPage navigationMode="next" embedded />
    </AccountSettingsLayout>
  )
}
