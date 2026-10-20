import type { RosterListItem } from '../api/client'
import { useT } from '../i18n'
import { formatMembershipRole } from '../repertoire/ui'
import { GroupButton, GroupChip, GroupDialog } from './ui'

/** A roster person has no account identity, presence or account-editable fields. */
export function RosterPersonProfileDialog({ person, onClose }: { person: RosterListItem; onClose: () => void }) {
  const { t, lang } = useT()
  return (
    <GroupDialog open size="md" title={t('people.profileTitle')} onClose={onClose}
      footer={<GroupButton variant="secondary" onClick={onClose}>{t('common.close')}</GroupButton>}>
      <div className="space-y-2">
        <h2 className="break-words text-xl font-semibold text-ink">{person.displayName}</h2>
        <GroupChip tone="outline">{t('people.rosterOnly')}</GroupChip>
        <p className="text-sm leading-relaxed text-muted">{t('people.rosterOnlyHint')}</p>
      </div>
      <dl className="space-y-3 rounded-xl bg-surface-hover/40 p-4 text-sm">
        <div><dt className="text-muted">{t('people.roleInGroup')}</dt><dd className="text-ink">{formatMembershipRole(person.role, t)}</dd></div>
        <div><dt className="text-muted">{t('people.joinedLabel')}</dt><dd className="text-ink">{new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(person.createdAt))}</dd></div>
      </dl>
    </GroupDialog>
  )
}
