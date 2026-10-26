import type { CSSProperties } from 'react'
import { useT } from '../../../i18n'

type BrandingComponentPreviewProps = {
  tokens: Record<string, string>
}

export function BrandingComponentPreview({ tokens }: BrandingComponentPreviewProps) {
  const { t } = useT()

  return (
    <div
      data-testid="branding-component-preview"
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 font-sans"
      style={tokens as CSSProperties}
    >
      <p className="text-sm font-medium text-ink">{t('settings.previewComponents')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="space-y-1 rounded-xl bg-canvas p-2">
            <span className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary-ink">
              <span className="h-3 w-3 rounded-full bg-primary" aria-hidden="true" />
              {t('nav.home')}
            </span>
            <span className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted">
              <span className="h-3 w-3 rounded-full bg-muted/40" aria-hidden="true" />
              {t('nav.songs')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-9 items-center rounded-xl bg-primary-strong px-3 text-sm font-semibold text-primary-foreground">
              {t('settings.saveBranding')}
            </span>
            <span className="inline-flex h-9 items-center rounded-xl border border-border-subtle px-3 text-sm font-medium text-ink">
              {t('settings.clearColor')}
            </span>
            <span className="inline-flex h-9 items-center px-1 text-sm font-semibold text-primary-ink underline">
              {t('settings.resetToDefault')}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-border-subtle bg-surface p-3">
            <p className="text-sm font-semibold text-ink">{t('settings.previewCardTitle')}</p>
            <p className="text-xs text-muted">{t('settings.previewCardBody')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-strong text-xs font-bold text-primary-foreground">
              A
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
              {t('nav.roles')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
