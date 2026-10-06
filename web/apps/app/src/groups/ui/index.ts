/**
 * Group-scoped UI kit (ADR-0074 §4/§5).
 *
 * Every primitive here reads the semantic tokens the group shell repaints
 * (`--color-primary*`, `--color-surface*`, `--color-border-subtle`,
 * `--color-ink`, `--color-muted`…), so the whole group area follows the group
 * accent — and the branding editor's unsaved preview — live.
 *
 * Deliberately separate from `src/ui/*`: the account/panel and auth surfaces
 * keep Sonivo's fixed identity and must not import these.
 */
export {
  GroupButton,
  GroupLink,
  groupButtonVariants,
  groupPrimaryButtonClass,
  groupSecondaryButtonClass,
  groupSoftButtonClass,
  groupGhostButtonClass,
  groupDangerButtonClass,
} from './GroupButton'
export {
  GroupCard,
  GroupStat,
  GroupChip,
  GroupIconWell,
  GroupIconButton,
  type GroupCardProps,
  type GroupStatProps,
  type GroupChipTone,
} from './GroupCard'
export {
  GroupPageHeader,
  GroupBreadcrumb,
  type GroupPageHeaderProps,
  type GroupBreadcrumbItem,
} from './GroupPageHeader'
export { GroupSection, type GroupSectionProps } from './GroupSection'
export {
  GroupEmptyState,
  GroupErrorState,
  GroupSkeleton,
  GroupListSkeleton,
  GroupPageSkeleton,
} from './GroupStates'
export {
  GroupField,
  GroupInput,
  GroupTextArea,
  groupFieldClass,
  type GroupInputProps,
  type GroupTextAreaProps,
} from './GroupField'
export { GroupSelect, type GroupSelectProps, type GroupSelectOption } from './GroupSelect'
export { GroupDialog, type GroupDialogProps } from './GroupDialog'
export {
  GroupLimitNotice,
  limitReached,
  type GroupLimitNoticeProps,
} from './GroupLimitNotice'
export { useGroupDataSignal } from './live'
