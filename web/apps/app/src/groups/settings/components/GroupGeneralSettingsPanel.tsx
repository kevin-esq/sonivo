import type { BrandingCapabilities } from '../../../api/client'
import type { BrandDraft } from '../../../shell/brandPreview'
import { useT } from '../../../i18n'
import { ConflictAlert, ProblemAlert } from '../../../repertoire/ui'
import { fieldClass } from '../../../ui/field'

type GroupGeneralSettingsPanelProps = {
  isOwner: boolean
  renameName: string
  renameConflict: string | null
  renameError: string | null
  onRenameChange: (name: string) => void
  brandingEnabled: boolean
  draft: BrandDraft | null
  isBrandingFieldLocked: (field: keyof BrandingCapabilities) => boolean
  onDraftChange: (patch: Partial<BrandDraft>) => void
}

export function GroupGeneralSettingsPanel({
  isOwner,
  renameName,
  renameConflict,
  renameError,
  onRenameChange,
  brandingEnabled,
  draft,
  isBrandingFieldLocked,
  onDraftChange,
}: GroupGeneralSettingsPanelProps) {
  const { t } = useT()

  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={(event) => event.preventDefault()} noValidate>
        <h2 className="text-lg font-semibold">{t('dashboard.renameTitle')}</h2>
        <ConflictAlert message={renameConflict} />
        <ProblemAlert message={renameError} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-ink">{t('settings.name')}</span>
          <input
            className={fieldClass}
            type="text"
            required
            data-testid="group-name-input"
            value={renameName}
            disabled={!isOwner}
            aria-readonly={!isOwner}
            onChange={(event) => onRenameChange(event.target.value)}
            maxLength={200}
          />
        </label>
      </form>

      {brandingEnabled && draft ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('settings.brandingTitle')}</h2>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('settings.displayNameOverride')}</span>
            <input
              className={fieldClass}
              type="text"
              data-testid="brand-display-name"
              value={draft.displayName}
              disabled={!isOwner || isBrandingFieldLocked('brandName')}
              maxLength={120}
              onChange={(event) => onDraftChange({ displayName: event.target.value })}
            />
            <span className="text-xs text-muted">{t('settings.displayNameHint')}</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('settings.welcomeText')}</span>
            <input
              className={fieldClass}
              type="text"
              value={draft.welcomeText}
              disabled={!isOwner || isBrandingFieldLocked('welcomeText')}
              maxLength={500}
              onChange={(event) => onDraftChange({ welcomeText: event.target.value })}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">{t('settings.loginHeadline')}</span>
            <input
              className={fieldClass}
              type="text"
              value={draft.loginHeadline}
              disabled={!isOwner || isBrandingFieldLocked('loginBranding')}
              maxLength={500}
              onChange={(event) => onDraftChange({ loginHeadline: event.target.value })}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('settings.tagline')}</span>
              <input
                className={fieldClass}
                type="text"
                value={draft.tagline}
                disabled={!isOwner || isBrandingFieldLocked('brandName')}
                maxLength={160}
                onChange={(event) => onDraftChange({ tagline: event.target.value })}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('settings.verse')}</span>
              <input
                className={fieldClass}
                type="text"
                value={draft.verse}
                disabled={!isOwner || isBrandingFieldLocked('brandName')}
                maxLength={200}
                onChange={(event) => onDraftChange({ verse: event.target.value })}
              />
            </label>
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={draft.showSonivoCredit}
              disabled={!isOwner || isBrandingFieldLocked('removePoweredBy')}
              onChange={(event) => onDraftChange({ showSonivoCredit: event.target.checked })}
            />
            {t('settings.showSonivoCredit')}
          </label>
        </div>
      ) : null}
    </div>
  )
}
