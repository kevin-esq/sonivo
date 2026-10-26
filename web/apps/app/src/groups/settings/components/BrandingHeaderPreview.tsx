import type { CSSProperties } from 'react'
import type { GroupBranding } from '../../../api/client'
import { contrastRatio } from '../../../brand/tokens'
import type { BrandDraft } from '../../../shell/brandPreview'
import { coverUsesLightText, isGradientCover, isNoneCover } from '../../../shell/groupAccent'
import { cn } from '../../../ui/cn'
import { useT } from '../../../i18n'

type BrandingHeaderPreviewProps = {
  groupName: string
  branding: GroupBranding
  draft: BrandDraft
  pendingLogoUrl?: string
  tokens: Record<string, string>
  headerStyle: CSSProperties
}

export function BrandingHeaderPreview({
  groupName,
  branding,
  draft,
  pendingLogoUrl,
  tokens,
  headerStyle,
}: BrandingHeaderPreviewProps) {
  const { t } = useT()
  const lightText = Boolean(branding.bannerUrl) || coverUsesLightText(draft.cover)

  return (
    <div
      data-testid="branding-preview"
      className="overflow-hidden rounded-2xl"
      style={{ ...tokens, ...headerStyle } as CSSProperties}
    >
      <div className="flex items-center gap-4 px-5 py-5">
        <span
          className={cn(
            'grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl font-semibold',
            branding.bannerUrl || !isNoneCover(draft.cover) ? 'bg-black/25' : 'bg-black/5 text-ink',
          )}
          aria-hidden="true"
        >
          {pendingLogoUrl || branding.logoUrl ? (
            <img src={pendingLogoUrl ?? branding.logoUrl ?? ''} alt="" className="h-9 w-9 rounded object-contain" />
          ) : isGradientCover(draft.cover) || isNoneCover(draft.cover) ? (
            (draft.displayName || groupName).slice(0, 1).toUpperCase()
          ) : (
            draft.cover
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-display text-2xl font-semibold tracking-tight', lightText ? 'text-white' : 'text-ink')}>
            {draft.displayName || groupName}
          </p>
          {draft.tagline || draft.welcomeText ? (
            <p className={cn('mt-0.5 truncate text-sm', lightText ? 'text-white/85' : 'text-muted')}>
              {draft.tagline || draft.welcomeText}
            </p>
          ) : null}
          {draft.verse ? (
            <p className={cn('mt-1 truncate text-xs italic', lightText ? 'text-white/70' : 'text-muted')}>
              {draft.verse}
            </p>
          ) : null}
        </div>
        {draft.secondaryHex ? (
          <span
            className="hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-block"
            style={{ backgroundColor: draft.secondaryHex, color: branding.onSecondary ?? '#0f172a' }}
          >
            {t('settings.preview')}
          </span>
        ) : null}
        <span
          className={cn(
            'hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-block',
            contrastRatio(draft.accentHex || '#8366f1', '#ffffff') >= 4.5
              ? 'bg-success/20 text-ink'
              : 'bg-error/20 text-error-ink',
          )}
        >
          {t('settings.contrastLabel')}{' '}
          {contrastRatio(draft.accentHex || '#8366f1', '#ffffff') >= 4.5
            ? t('settings.contrastAA')
            : t('settings.contrastFail')}
        </span>
      </div>
    </div>
  )
}
