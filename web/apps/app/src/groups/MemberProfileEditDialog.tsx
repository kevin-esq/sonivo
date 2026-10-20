import { useState } from 'react'
import type { MemberListItem } from '../api/client'
import { useT } from '../i18n'
import { mutationErrorMessage } from '../repertoire/ui'
import { MusicalRolePicker } from './MusicalRoleChips'
import { GroupButton, GroupDialog, GroupTextArea } from './ui'

type Props = {
  member: MemberListItem
  onClose: () => void
  onSaveDescription: (description: string) => Promise<void>
  onSaveSkills: (skills: string) => Promise<void>
}

/** Group-editable profile fields; account identity and permissions have separate owners. */
export function MemberProfileEditDialog({ member, onClose, onSaveDescription, onSaveSkills }: Props) {
  const { t } = useT()
  const [description, setDescription] = useState(member.description ?? '')
  const [skills, setSkills] = useState(member.musicalRole ?? '')
  const [savedDescription, setSavedDescription] = useState(member.description ?? '')
  const [savedSkills, setSavedSkills] = useState(member.musicalRole ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirty = description.trim() !== savedDescription.trim() || skills !== savedSkills

  function requestClose() {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }

  async function save() {
    if (pending || !dirty) return
    setPending(true)
    setError(null)
    try {
      // Remember each successful field so a partial failure can be retried safely.
      if (description.trim() !== savedDescription.trim()) {
        await onSaveDescription(description)
        setSavedDescription(description)
      }
      if (skills !== savedSkills) {
        await onSaveSkills(skills)
        setSavedSkills(skills)
      }
      onClose()
    } catch (err) {
      setError(mutationErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
    <GroupDialog open size="lg" onClose={requestClose} pending={pending}
      title={t('people.editProfile')} onSubmit={() => void save()}
      footer={<>
        <GroupButton variant="secondary" onClick={requestClose} disabled={pending}>{t('common.cancel')}</GroupButton>
        <GroupButton type="submit" disabled={pending || !dirty}>{pending ? t('people.saving') : t('common.save')}</GroupButton>
      </>}>
      <dl className="grid gap-3 rounded-xl bg-surface-hover/40 p-3 text-sm sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-muted">{t('people.fullName')}</dt><dd className="break-words font-medium text-ink">{member.displayName}</dd></div>
        <div className="min-w-0"><dt className="text-muted">{t('people.emailLabel')}</dt><dd className="break-words font-medium text-ink">{member.email ?? t('people.emailNone')}</dd></div>
      </dl>
      <p className="text-xs text-muted">{t('people.profileIdentityHint')}</p>
      <GroupTextArea label={t('people.descriptionLabel')} hint={t('people.descriptionHint')}
        value={description} maxLength={500} rows={4} disabled={pending}
        onChange={(event) => setDescription(event.target.value)} />
      <fieldset className="min-w-0 space-y-2" disabled={pending}>
        <legend className="mb-2 text-sm font-medium text-ink">{t('people.colInstrument')}</legend>
        <MusicalRolePicker value={skills} disabled={pending} onChange={setSkills} />
        <p className="text-xs text-muted">{t('people.instrumentHint')}</p>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-error-ink">{error}</p> : null}
    </GroupDialog>
    <GroupDialog open={confirmDiscard} size="sm" title={t('tasks.discardConfirmTitle')}
      onClose={() => setConfirmDiscard(false)}
      footer={<>
        <GroupButton variant="secondary" onClick={() => setConfirmDiscard(false)}>{t('common.cancel')}</GroupButton>
        <GroupButton variant="danger" onClick={onClose}>{t('tasks.discard')}</GroupButton>
      </>}>
      <p className="text-sm text-muted">{t('tasks.discardConfirm')}</p>
    </GroupDialog>
    </>
  )
}
