import { Copy, Pencil, Trash2, Users } from 'lucide-react'
import { useT } from '../../i18n'
import { GroupActionMenu } from '../ui'

export function RoleMenu({
  label,
  onEdit,
  onDuplicate,
  onManage,
  onDelete,
}: {
  label: string
  onEdit: () => void
  onDuplicate: () => void
  onManage: () => void
  onDelete: () => void
}) {
  const { t } = useT()
  return (
    <GroupActionMenu
      label={label}
      items={[
        { key: 'edit', label: t('roles.editRole'), icon: Pencil, onSelect: onEdit },
        { key: 'duplicate', label: t('roles.duplicateRole'), icon: Copy, onSelect: onDuplicate },
        { key: 'members', label: t('roles.manageMembersFor'), icon: Users, onSelect: onManage },
        {
          key: 'delete',
          label: t('roles.deleteRole'),
          icon: Trash2,
          danger: true,
          separatorBefore: true,
          onSelect: onDelete,
        },
      ]}
    />
  )
}
