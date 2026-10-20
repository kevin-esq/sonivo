import { useT } from '../../i18n'
import { GroupSelect } from '../ui'
import type { GroupRole } from '../../api/client'

/** Select for assigning a custom group role to a member (ADR-0080). */
export function GroupRoleSelect({
  roles,
  value,
  disabled,
  onChange,
}: {
  roles: GroupRole[] | null
  value: string | null
  disabled?: boolean
  onChange: (roleId: string | null) => void
}) {
  const { t } = useT()
  const options = [
    { value: '', label: t('groupRole.noRole') },
    ...(roles ?? [])
      .filter((role) => !role.isSystem)
      .map((role) => ({ value: role.id, label: role.name })),
  ]
  if (options.length === 1) return null
  return (
    <GroupSelect
      label={t('groupRole.assign')}
      value={value ?? ''}
      disabled={disabled}
      options={options}
      onChange={(next) => onChange(next === '' ? null : next)}
    />
  )
}
