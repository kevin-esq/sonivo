import { useState } from 'react'
import { Check, Copy, KeyRound, Mail, UserPlus } from 'lucide-react'
import type { FormEvent } from 'react'
import {
  createRosterMember,
  resetRosterAccess,
  type RosterCredentials,
} from '../api/client'
import { useT } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { GroupButton, GroupDialog, GroupInput } from './ui'

type Props = {
  groupId: string
  groupSlug: string | null
  onClose: () => void
  onChanged: () => void
  /** Present to (re)generate access for an existing roster member instead of creating. */
  resetMember?: { memberId: string; displayName: string } | null
}

/**
 * Owner dialog to add a member WITHOUT a Sonivo account (ADR-0047): the server
 * provisions a managed account and returns the credentials to hand over. The
 * same dialog resets access for an existing managed member.
 */
export function GroupRosterDialog({ groupId, groupSlug, onClose, onChanged, resetMember }: Props) {
  const { t } = useT()
  const resetMode = Boolean(resetMember)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<RosterCredentials | null>(null)
  const [copied, setCopied] = useState(false)

  const username = credentials?.handle && groupSlug
    ? `${credentials.handle}@${groupSlug}`
    : credentials?.handle ?? ''

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = resetMember
        ? await resetRosterAccess(groupId, resetMember.memberId)
        : await createRosterMember(groupId, {
            displayName: displayName.trim(),
            grantAccess: true,
            email: email.trim() || null,
            handle: handle.trim() || null,
          })
      setCredentials(result)
      onChanged()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  async function onCopy() {
    if (!credentials) return
    const text = [username && `${t('roster.username')}: ${username}`, credentials.temporaryPassword && `${t('roster.password')}: ${credentials.temporaryPassword}`]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={resetMode ? t('roster.resetTitle') : t('roster.dialogTitle')}
      description={resetMode ? undefined : t('roster.dialogHint')}
      pending={pending}
      testId="roster-dialog"
      onSubmit={credentials ? undefined : () => void onSubmit()}
      footer={
        credentials ? (
          <GroupButton type="button" onClick={onClose}>
            {t('roster.done')}
          </GroupButton>
        ) : (
          <>
            <GroupButton variant="secondary" type="button" onClick={onClose} disabled={pending}>
              {t('roster.cancel')}
            </GroupButton>
            <GroupButton
              type="submit"
              disabled={pending || (!resetMode && !displayName.trim())}
              onClick={resetMode ? () => void onSubmit() : undefined}
            >
              {pending
                ? t('roster.creating')
                : resetMode
                  ? t('roster.reset')
                  : t('roster.create')}
            </GroupButton>
          </>
        )
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      {credentials ? (
        credentials.credential === 'activation_link' ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Mail className="h-4 w-4 text-primary-ink" aria-hidden="true" />
              {credentials.mailed ? t('roster.activationSent') : t('roster.activationFailed')}
            </p>
            {!credentials.mailed ? (
              <p className="text-sm text-muted">{t('roster.activationFailedHint')}</p>
            ) : null}
          </div>
        ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-primary-ink" aria-hidden="true" />
            {t('roster.credentialsTitle')}
          </p>
          <p className="text-sm text-muted">{t('roster.credentialsHint')}</p>
          <dl className="space-y-2 rounded-xl border border-border-subtle bg-surface p-4 text-sm">
            {username ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{t('roster.username')}</dt>
                <dd className="font-medium text-ink">{username}</dd>
              </div>
            ) : null}
            {credentials.temporaryPassword ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{t('roster.password')}</dt>
                <dd className="font-mono text-ink">{credentials.temporaryPassword}</dd>
              </div>
            ) : null}
          </dl>
          <GroupButton variant="secondary" type="button" onClick={() => void onCopy()}>
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? t('roster.copied') : t('roster.copy')}
          </GroupButton>
        </div>
        )
      ) : resetMode ? (
        <p className="text-sm text-muted">{t('roster.resetHint')}</p>
      ) : (
        <div className="space-y-4">
          <GroupInput
            label={t('roster.name')}
            value={displayName}
            maxLength={200}
            disabled={pending}
            onChange={(event) => setDisplayName(event.target.value)}
            data-autofocus
          />
          <GroupInput
            label={t('roster.email')}
            hint={t('roster.emailHint')}
            type="email"
            value={email}
            maxLength={320}
            disabled={pending}
            onChange={(event) => setEmail(event.target.value)}
          />
          <GroupInput
            label={t('roster.handle')}
            hint={t('roster.handleHint')}
            value={handle}
            maxLength={32}
            disabled={pending}
            onChange={(event) => setHandle(event.target.value)}
          />
        </div>
      )}
    </GroupDialog>
  )
}
