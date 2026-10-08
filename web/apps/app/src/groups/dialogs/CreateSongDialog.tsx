/**
 * Create-song modal (ADR-0074 §5). Thin re-export of the redesigned wizard so
 * existing callers keep importing `CreateSongDialog` unchanged.
 */
export { CreateSongWizard as CreateSongDialog } from './CreateSongWizard'
export type { CreateSongDialogProps } from './CreateSongWizard'
