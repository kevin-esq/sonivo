import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, CSSProperties, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  deleteGroup,
  fetchFeatures,
  getGroup,
  getGroupBranding,
  problemDetail,
  updateGroup,
  updateGroupBranding,
  uploadGroupBrandingImage,
  uploadGroupBrandingFavicon,
  type BrandingCapabilities,
  type CurrentUser,
  type GroupBranding,
  type GroupDetail,
} from '../api/client'
import { BRAND_THEMES, GRADIENT_STYLES, INTENSITY_OPTIONS, TYPOGRAPHY_OPTIONS, deriveGroupThemeTokens } from '../brand/tokens'
import { useBrandPreview } from './brandPreview'
import { useTheme } from '../brand/theme'
import { useT, type I18nKey } from '../i18n'
import {
  ACCESS_DENIED_MESSAGE,
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
} from '../repertoire/ui'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import {
  GROUP_ACCENT_PRESETS,
  GROUP_COVER_EMOJIS,
  GROUP_COVER_GRADIENTS,
  NO_COVER,
  coverUsesLightText,
  groupCoverStyle,
  isGradientCover,
  isNoneCover,
  readGroupAppearance,
  writeGroupAppearance,
  type GroupAppearance,
} from './groupAccent'
import { notifyGroupUpdated } from './groupEvents'

/** Accessible colour names for the accent swatches (values stay hex). */
const ACCENT_NAME_KEYS: Record<string, I18nKey> = {
  '#8366f1': 'ajustes.accentViolet',
  '#0ea5e9': 'ajustes.accentSky',
  '#10b981': 'ajustes.accentEmerald',
  '#f3b626': 'ajustes.accentAmber',
  '#ef4444': 'ajustes.accentRed',
  '#e8c4f6': 'ajustes.accentLilac',
}

/**
 * Server-validated primary swatches (ADR-0048/0054): each meets WCAG AA against
 * white so the accent can back white header/nav text. The legacy device-local
 * presets (`GROUP_ACCENT_PRESETS`) are decorative and are NOT all AA-safe.
 */
const BRAND_PRIMARY_PRESETS = ['#6d4ee0', '#0369a1', '#047857', '#b45309', '#b91c1c', '#7e22ce'] as const

/** Secondary swatches: each meets AA with either white or near-black ink. */
const BRAND_SECONDARY_PRESETS = ['#0ea5e9', '#10b981', '#f3b626', '#ef4444', '#e8c4f6', '#a78bfa'] as const

const BRAND_COLOR_NAME_KEYS: Record<string, I18nKey> = {
  '#6d4ee0': 'ajustes.accentViolet',
  '#0369a1': 'ajustes.accentSky',
  '#047857': 'ajustes.accentEmerald',
  '#b45309': 'ajustes.accentAmber',
  '#b91c1c': 'ajustes.accentRed',
  '#7e22ce': 'ajustes.accentLilac',
  '#0ea5e9': 'ajustes.accentSky',
  '#10b981': 'ajustes.accentEmerald',
  '#f3b626': 'ajustes.accentAmber',
  '#ef4444': 'ajustes.accentRed',
  '#e8c4f6': 'ajustes.accentLilac',
  '#a78bfa': 'ajustes.accentLilac',
}

/** ADR-0059: predefined brand palettes (primary + secondary together). */
const BRAND_PALETTES: { id: string; primary: string; secondary: string }[] = [
  { id: 'oceano', primary: '#0369a1', secondary: '#0ea5e9' },
  { id: 'atardecer', primary: '#b45309', secondary: '#f3b626' },
  { id: 'bosque', primary: '#047857', secondary: '#10b981' },
  { id: 'dark', primary: '#6d4ee0', secondary: '#a78bfa' },
]

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  const [lighter, darker] = a >= b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Visible/accessible gradient names, translated while the storage id stays English. */
const GRADIENT_NAME_KEYS: Record<string, I18nKey> = {
  violet: 'ajustes.coverGradientViolet',
  ocean: 'ajustes.coverGradientOcean',
  forest: 'ajustes.coverGradientForest',
  sunset: 'ajustes.coverGradientSunset',
}

/** Brand editor draft (ADR-0054); colours stay as raw hex until saved/validated. */
type BrandDraft = {
  displayName: string
  accentHex: string
  secondaryHex: string
  accentColorHex: string
  successHex: string
  warningHex: string
  errorHex: string
  typography: string
  cover: string
  themeDefault: string
  defaultLocale: string
  welcomeText: string
  loginHeadline: string
  tagline: string
  verse: string
  showSonivoCredit: boolean
  themeId: string
  intensity: 'subtle' | 'medium' | 'intense'
  gradientStyle: 'fixed' | 'liquid'
}

/** Narrow a stored intensity string to the union the token engine accepts. */
function asIntensity(value: string | null | undefined): 'subtle' | 'medium' | 'intense' {
  return value === 'subtle' || value === 'intense' ? value : 'medium'
}

/** Narrow a stored gradient style string to the union the token engine accepts. */
function asGradientStyle(value: string | null | undefined): 'fixed' | 'liquid' {
  return value === 'liquid' ? 'liquid' : 'fixed'
}

function coverFromBranding(branding: GroupBranding): string {
  if (branding.coverKind === 'gradient' && branding.coverValue) return `gradient:${branding.coverValue}`
  if (branding.coverKind === 'emoji' && branding.coverValue) return branding.coverValue
  return NO_COVER
}

function coverToBranding(cover: string): { coverKind: string | null; coverValue: string | null } {
  if (cover === NO_COVER) return { coverKind: null, coverValue: null }
  if (cover.startsWith('gradient:')) return { coverKind: 'gradient', coverValue: cover.slice('gradient:'.length) }
  return { coverKind: 'emoji', coverValue: cover }
}

function draftFromBranding(branding: GroupBranding): BrandDraft {
  return {
    displayName: branding.displayName ?? '',
    accentHex: branding.accentHex ?? '',
    secondaryHex: branding.secondaryHex ?? '',
    accentColorHex: branding.accentColorHex ?? '',
    successHex: branding.successHex ?? '',
    warningHex: branding.warningHex ?? '',
    errorHex: branding.errorHex ?? '',
    typography: branding.typography ?? 'system',
    cover: coverFromBranding(branding),
    themeDefault: branding.themeDefault ?? 'system',
    defaultLocale: branding.defaultLocale ?? 'es',
    welcomeText: branding.welcomeText ?? '',
    loginHeadline: branding.loginHeadline ?? '',
    tagline: branding.tagline ?? '',
    verse: branding.verse ?? '',
    showSonivoCredit: branding.showSonivoCredit,
    themeId: branding.themeId ?? 'sonivo',
    intensity: asIntensity(branding.intensity),
    gradientStyle: asGradientStyle(branding.gradientStyle),
  }
}

type SettingsTab = 'general' | 'branding' | 'permissions' | 'notifications' | 'integrations' | 'advanced' | 'danger'

// Membership/billing is account-level (see /cuenta/membresia), not group-owned;
// the group centre only exposes group-scoped settings.
const SETTINGS_TABS: { id: SettingsTab; labelKey: I18nKey }[] = [
  { id: 'general', labelKey: 'ajustes.tabGeneral' },
  { id: 'branding', labelKey: 'ajustes.tabBranding' },
  { id: 'permissions', labelKey: 'ajustes.tabPermissions' },
  { id: 'notifications', labelKey: 'ajustes.tabNotifications' },
  { id: 'integrations', labelKey: 'ajustes.tabIntegrations' },
  { id: 'advanced', labelKey: 'ajustes.tabAdvanced' },
  { id: 'danger', labelKey: 'ajustes.tabDanger' },
]

export function GroupSettingsPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { t } = useT()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<GroupAppearance>(() => readGroupAppearance(groupId))
  const [saved, setSaved] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameConflict, setRenameConflict] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // Plan gating mirrors the server-enforced branding PUT (validation symmetry):
  // a forbidden control is disabled, and the save payload echoes the saved value
  // for gated fields so a lower plan never clears advanced config.
  const caps = group?.capabilities
  const can = (key: keyof BrandingCapabilities) => Boolean(caps?.[key])
  const locked = (key: keyof BrandingCapabilities) => (caps ? !can(key) : false)
  const planLimited = caps ? Object.values(caps).some((value) => !value) : false

  // Phase 4.3 / ADR-0054: server-side White Label editor behind Features:GroupBranding.
  const [brandingEnabled, setBrandingEnabled] = useState(false)
  const [branding, setBranding] = useState<GroupBranding | null>(null)
  const [draft, setDraft] = useState<BrandDraft | null>(null)
  const [savingBrand, setSavingBrand] = useState(false)
  const [brandSaved, setBrandSaved] = useState(false)
  const [brandError, setBrandError] = useState<string | null>(null)
  const [brandConflict, setBrandConflict] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'logo' | 'banner' | 'favicon' | null>(null)

  // Live component preview uses the same semantic tokens as the real workspace,
  // derived from the *draft* colours so it updates before saving.
  const { theme } = useTheme()
  const previewFontFamily = useMemo(
    () => TYPOGRAPHY_OPTIONS.find((option) => option.id === (draft?.typography ?? 'system'))?.fontFamily ?? null,
    [draft?.typography],
  )
  const componentPreviewTokens = useMemo(
    () =>
      draft
        ? deriveGroupThemeTokens({
            primary: draft.accentHex || '#8366f1',
            secondary: draft.secondaryHex || null,
            accent: draft.accentColorHex || null,
            success: draft.successHex || null,
            warning: draft.warningHex || null,
            error: draft.errorHex || null,
            typography: previewFontFamily,
            theme,
            intensity: draft.intensity,
            gradientStyle: draft.gradientStyle,
          })
        : {},
    [draft, previewFontFamily, theme],
  )

  // Publish the draft tokens to the group shell so the WHOLE workspace
  // repaints in real time while editing (cleared on leave).
  const { setTokens: setBrandPreview } = useBrandPreview()
  useEffect(() => {
    setBrandPreview(draft ? componentPreviewTokens : null)
    return () => setBrandPreview(null)
  }, [draft, componentPreviewTokens, setBrandPreview])

  useEffect(() => {
    let cancelled = false
    fetchFeatures()
      .then((flags) => {
        if (!cancelled) setBrandingEnabled(flags.groupBranding)
      })
      .catch(() => {
        if (!cancelled) setBrandingEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setSaved(false)
      setBrandSaved(false)
      setAppearance(readGroupAppearance(groupId))
      try {
        const result = await getGroup(groupId)
        if (!cancelled) {
          setGroup(result)
          setRenameName(result.name)
        }
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError(ACCESS_DENIED_MESSAGE)
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  useEffect(() => {
    if (!groupId || !brandingEnabled) return
    let cancelled = false
    async function loadBranding() {
      try {
        const result = await getGroupBranding(groupId!)
        if (cancelled) return
        setBranding(result)
        setDraft(draftFromBranding(result))
      } catch {
        if (!cancelled) {
          setBranding(null)
          setDraft(null)
        }
      }
    }
    void loadBranding()
    return () => {
      cancelled = true
    }
  }, [groupId, brandingEnabled])

  function update(next: GroupAppearance) {
    if (!groupId || !isOwnerRole(group?.role)) return
    setAppearance(next)
    writeGroupAppearance(groupId, next)
    setSaved(true)
  }

  function patchDraft(patch: Partial<BrandDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
    setBrandSaved(false)
  }

  const isDirty = useMemo(() => {
    if (!draft || !branding) return false
    const current = draftFromBranding(branding)
    return JSON.stringify(draft) !== JSON.stringify(current)
  }, [draft, branding])

  async function onRename(event: FormEvent) {
    event.preventDefault()
    if (!groupId || !group) return
    setRenaming(true)
    setRenameError(null)
    setRenameConflict(null)
    try {
      const updated = await updateGroup(group.id, {
        name: renameName,
        expectedVersion: group.version,
      })
      setGroup(updated)
      setRenameName(updated.name)
      notifyGroupUpdated()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRenameConflict(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setRenameError(mutationErrorMessage(reloadErr))
        }
      } else {
        setRenameError(mutationErrorMessage(err))
      }
    } finally {
      setRenaming(false)
    }
  }

  async function onSaveBranding() {
    if (!group || !branding || !draft || !isOwnerRole(group.role)) return
    setSavingBrand(true)
    setBrandError(null)
    setBrandConflict(null)
    // Echo the currently-saved value for gated fields when the plan forbids them,
    // so a lower plan preserves (rather than clears) advanced configuration.
    const saved = draftFromBranding(branding)
    const cover = coverToBranding(can('icon') ? draft.cover : saved.cover)
    try {
      const updated = await updateGroupBranding(group.id, {
        expectedVersion: branding.version,
        displayName: can('brandName') ? draft.displayName.trim() || null : saved.displayName.trim() || null,
        accentHex: can('accent') ? draft.accentHex.trim() || null : saved.accentHex.trim() || null,
        secondaryHex: can('splitColors') ? draft.secondaryHex.trim() || null : saved.secondaryHex.trim() || null,
        accentColorHex: can('accent') ? draft.accentColorHex.trim() || null : saved.accentColorHex.trim() || null,
        successHex: can('splitColors') ? draft.successHex.trim() || null : saved.successHex.trim() || null,
        warningHex: can('splitColors') ? draft.warningHex.trim() || null : saved.warningHex.trim() || null,
        errorHex: can('splitColors') ? draft.errorHex.trim() || null : saved.errorHex.trim() || null,
        typography: can('font') ? draft.typography || null : saved.typography || null,
        coverKind: cover.coverKind,
        coverValue: cover.coverValue,
        themeDefault: draft.themeDefault || null,
        defaultLocale: draft.defaultLocale || null,
        welcomeText: can('welcomeText') ? draft.welcomeText.trim() || null : saved.welcomeText.trim() || null,
        loginHeadline: can('loginBranding')
          ? draft.loginHeadline.trim() || null
          : saved.loginHeadline.trim() || null,
        tagline: can('brandName') ? draft.tagline.trim() || null : saved.tagline.trim() || null,
        verse: can('brandName') ? draft.verse.trim() || null : saved.verse.trim() || null,
        showSonivoCredit: can('removePoweredBy') ? draft.showSonivoCredit : true,
        themeId: can('themes') ? draft.themeId : saved.themeId,
        intensity: can('intensity') ? draft.intensity : saved.intensity,
        gradientStyle: can('gradientStyle') ? draft.gradientStyle : saved.gradientStyle,
      })
      setBranding(updated)
      setDraft(draftFromBranding(updated))
      setBrandSaved(true)
      notifyGroupUpdated()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBrandConflict(CONFLICT_MESSAGE)
        try {
          const latest = await getGroupBranding(group.id)
          setBranding(latest)
          setDraft(draftFromBranding(latest))
        } catch (reloadErr) {
          setBrandError(mutationErrorMessage(reloadErr))
        }
      } else {
        setBrandError(mutationErrorMessage(err))
      }
    } finally {
      setSavingBrand(false)
    }
  }

  async function onUploadImage(kind: 'logo' | 'banner' | 'favicon', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !group) return
    setUploading(kind)
    setBrandError(null)
    try {
      const updated = kind === 'favicon'
        ? await uploadGroupBrandingFavicon(group.id, file)
        : await uploadGroupBrandingImage(group.id, kind, file)
      setBranding(updated)
      notifyGroupUpdated()
    } catch (err) {
      setBrandError(mutationErrorMessage(err))
    } finally {
      setUploading(null)
    }
  }

  async function onConfirmDelete() {
    if (!groupId || !group) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroup(group.id, group.version)
      setDeleteOpen(false)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(CONFLICT_MESSAGE)
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setDeleteError(mutationErrorMessage(reloadErr))
        }
      } else {
        setDeleteError(mutationErrorMessage(err))
      }
    } finally {
      setDeleting(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">{t('workspace.loadingGroupEllipsis')}</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-error-ink">
          {error}
        </p>
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
          {t('workspace.myGroups')}
        </Link>
      </div>
    )
  }

  const isOwner = isOwnerRole(group.role)
  const previewAccent = draft?.accentHex || '#8366f1'
  const previewHeaderStyle = branding?.bannerUrl
    ? {
        backgroundImage: `linear-gradient(rgba(15,23,42,0.45), rgba(15,23,42,0.45)), url(${branding.bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : groupCoverStyle(draft?.cover ?? NO_COVER, previewAccent)

  return (
    <section className="max-w-4xl space-y-6" aria-labelledby="ajustes-heading">
      <div className="space-y-1">
        <h1 id="ajustes-heading" className="text-2xl font-bold tracking-tight">
          {t('ajustes.title')}
        </h1>
        <p className="text-sm text-muted">{t('ajustes.subtitle')}</p>
      </div>

      {isOwner ? (
        <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm">{t('ajustes.ownerHint')}</p>
      ) : (
        <p role="note" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm">
          {t('ajustes.memberReadonly')}
        </p>
      )}

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-hover p-1" role="tablist" aria-label={t('ajustes.tabsLabel')}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
              activeTab === tab.id
                ? 'bg-surface text-ink shadow-sm'
                : 'text-muted hover:text-ink',
              tab.id === 'danger' && activeTab !== 'danger' ? 'text-error-ink hover:text-error-ink' : '',
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* General tab */}
      {activeTab === 'general' ? (
        <div className="space-y-6">
          <form className="space-y-3" onSubmit={(event) => void onRename(event)} noValidate>
            <h2 className="text-lg font-semibold">{t('inicio.renameTitle')}</h2>
            <ConflictAlert message={renameConflict} />
            <ProblemAlert message={renameError} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('ajustes.name')}</span>
              <input
                className={fieldClass}
                type="text"
                required
                data-testid="group-name-input"
                value={renameName}
                disabled={!isOwner}
                aria-readonly={!isOwner}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={200}
              />
            </label>
            {isOwner ? (
              <Button variant="secondary" type="submit" disabled={renaming}>
                {renaming ? t('inicio.working') : t('inicio.saveName')}
              </Button>
            ) : null}
          </form>

          {brandingEnabled && draft ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t('ajustes.brandingTitle')}</h2>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.displayNameOverride')}</span>
                <input
                  className={fieldClass}
                  type="text"
                  data-testid="brand-display-name"
                  value={draft.displayName}
                  disabled={!isOwner || locked('brandName')}
                  maxLength={120}
                  onChange={(e) => patchDraft({ displayName: e.target.value })}
                />
                <span className="text-xs text-muted">{t('ajustes.displayNameHint')}</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.welcomeText')}</span>
                <input
                  className={fieldClass}
                  type="text"
                  value={draft.welcomeText}
                  disabled={!isOwner || locked('welcomeText')}
                  maxLength={500}
                  onChange={(e) => patchDraft({ welcomeText: e.target.value })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.loginHeadline')}</span>
                <input
                  className={fieldClass}
                  type="text"
                  value={draft.loginHeadline}
                  disabled={!isOwner || locked('loginBranding')}
                  maxLength={500}
                  onChange={(e) => patchDraft({ loginHeadline: e.target.value })}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('ajustes.tagline')}</span>
                  <input
                    className={fieldClass}
                    type="text"
                    value={draft.tagline}
                    disabled={!isOwner || locked('brandName')}
                    maxLength={160}
                    onChange={(e) => patchDraft({ tagline: e.target.value })}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-ink">{t('ajustes.verse')}</span>
                  <input
                    className={fieldClass}
                    type="text"
                    value={draft.verse}
                    disabled={!isOwner || locked('brandName')}
                    maxLength={200}
                    onChange={(e) => patchDraft({ verse: e.target.value })}
                  />
                </label>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.showSonivoCredit}
                  disabled={!isOwner || locked('removePoweredBy')}
                  onChange={(e) => patchDraft({ showSonivoCredit: e.target.checked })}
                />
                {t('ajustes.showSonivoCredit')}
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Branding tab */}
      {activeTab === 'branding' && brandingEnabled && draft && branding ? (
        <section className="space-y-5" aria-labelledby="brand-heading" data-testid="branding-editor">
          <div className="space-y-1">
            <h2 id="brand-heading" className="text-lg font-semibold">
              {t('ajustes.brandingTitle')}
            </h2>
            <p className="text-sm text-muted">{t('ajustes.brandingSubtitle')}</p>
          </div>

          {planLimited ? (
            <div
              data-testid="brand-plan-lock"
              className="space-y-1 rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">{t('ajustes.planLockedTitle')}</p>
              <p className="text-sm text-muted">{t('ajustes.planLockedBody')}</p>
              <Link
                to="/cuenta/membresia"
                className="inline-block text-sm font-semibold text-primary-ink no-underline hover:underline"
              >
                {t('ajustes.planUpgrade')}
              </Link>
            </div>
          ) : null}

          {/* Live preview: header with banner (or cover), logo and both brand colours. */}
          <div
            data-testid="branding-preview"
            className="overflow-hidden rounded-2xl"
            style={{ ...componentPreviewTokens, ...previewHeaderStyle } as CSSProperties}
          >
            <div className="flex items-center gap-4 px-5 py-5">
              <span
                className={cn(
                  'grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl font-semibold',
                  branding.bannerUrl || !isNoneCover(draft.cover) ? 'bg-black/25' : 'bg-black/5 text-ink',
                )}
                aria-hidden="true"
              >
                {branding.logoUrl ? (
                  <img src={branding.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
                ) : isGradientCover(draft.cover) || isNoneCover(draft.cover) ? (
                  (draft.displayName || group.name).slice(0, 1).toUpperCase()
                ) : (
                  draft.cover
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate font-display text-2xl font-semibold tracking-tight',
                    branding.bannerUrl || coverUsesLightText(draft.cover) ? 'text-white' : 'text-ink',
                  )}
                >
                  {draft.displayName || group.name}
                </p>
                {draft.tagline || draft.welcomeText ? (
                  <p
                    className={cn(
                      'mt-0.5 truncate text-sm',
                      branding.bannerUrl || coverUsesLightText(draft.cover) ? 'text-white/85' : 'text-muted',
                    )}
                  >
                    {draft.tagline || draft.welcomeText}
                  </p>
                ) : null}
                {draft.verse ? (
                  <p
                    className={cn(
                      'mt-1 truncate text-xs italic',
                      branding.bannerUrl || coverUsesLightText(draft.cover) ? 'text-white/70' : 'text-muted',
                    )}
                  >
                    {draft.verse}
                  </p>
                ) : null}
              </div>
              {draft.secondaryHex ? (
                <span
                  className="hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-block"
                  style={{ backgroundColor: draft.secondaryHex, color: branding.onSecondary ?? '#0f172a' }}
                >
                  {t('ajustes.preview')}
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
                {t('ajustes.contrastLabel')}{' '}
                {contrastRatio(draft.accentHex || '#8366f1', '#ffffff') >= 4.5
                  ? t('ajustes.contrastAA')
                  : t('ajustes.contrastFail')}
              </span>
            </div>
          </div>

          {/* Component preview: buttons, nav, card and badge rendered with the
              same semantic tokens as the live workspace (draft-driven). */}
          <div
            data-testid="branding-component-preview"
            className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 font-sans"
            style={componentPreviewTokens as CSSProperties}
          >
            <p className="text-sm font-medium text-ink">{t('ajustes.previewComponents')}</p>
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
                    {t('ajustes.saveBranding')}
                  </span>
                  <span className="inline-flex h-9 items-center rounded-xl border border-border-subtle px-3 text-sm font-medium text-ink">
                    {t('ajustes.clearColor')}
                  </span>
                  <span className="inline-flex h-9 items-center px-1 text-sm font-semibold text-primary-ink underline">
                    {t('ajustes.resetToDefault')}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-border-subtle bg-surface p-3">
                  <p className="text-sm font-semibold text-ink">{t('ajustes.previewCardTitle')}</p>
                  <p className="text-xs text-muted">{t('ajustes.previewCardBody')}</p>
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

          <ConflictAlert message={brandConflict} />
          <ProblemAlert message={brandError} />

          {/* Contrast validation warning */}
          {draft.accentHex && contrastRatio(draft.accentHex, '#ffffff') < 4.5 ? (
            <p role="alert" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink">
              {t('ajustes.contrastWarning')}
            </p>
          ) : null}

          {/* Reset to default button */}
          {isOwner ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (branding) {
                    setDraft(draftFromBranding(branding))
                    setBrandSaved(false)
                  }
                }}
              >
                {t('ajustes.resetToDefault')}
              </Button>
            </div>
          ) : null}

          <fieldset className="space-y-3" disabled={!isOwner || locked('themes')}>
            <legend className="font-medium">{t('ajustes.themesTitle')}</legend>
            <p className="text-sm text-muted">{t('ajustes.themesHint')}</p>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
              role="group"
              aria-label={t('ajustes.themesTitle')}
            >
              {BRAND_THEMES.map((themeOption) => {
                const active = draft.themeId === themeOption.id
                return (
                  <button
                    key={themeOption.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      patchDraft({
                        themeId: themeOption.id,
                        accentHex: themeOption.primary,
                        secondaryHex: themeOption.secondary,
                      })
                    }
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                      active ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                    )}
                  >
                    <span className="flex shrink-0 -space-x-1" aria-hidden="true">
                      <span
                        className="h-5 w-5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: themeOption.primary }}
                      />
                      <span
                        className="h-5 w-5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: themeOption.secondary }}
                      />
                    </span>
                    <span className="truncate">{t(themeOption.labelKey as I18nKey)}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('accent')}>
            <legend className="font-medium">{t('ajustes.primaryColor')}</legend>
            <p className="text-sm text-muted">{t('ajustes.colorHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ajustes.primaryColor')}>
              {BRAND_PRIMARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.accentHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'ajustes.primaryColor')}
                  onClick={() => patchDraft({ accentHex: swatch })}
                  className={cn(
                    'h-11 w-11 rounded-full transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.accentHex.toLowerCase() === swatch
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-slate-300 hover:scale-105',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
              <input
                type="color"
                aria-label={t('ajustes.customColor')}
                value={draft.accentHex || '#8366f1'}
                onChange={(e) => patchDraft({ accentHex: e.target.value })}
                className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('splitColors')}>
            <legend className="font-medium">{t('ajustes.secondaryColor')}</legend>
            <p className="text-sm text-muted">{t('ajustes.secondaryHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ajustes.secondaryColor')}>
              {BRAND_SECONDARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.secondaryHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'ajustes.secondaryColor')}
                  onClick={() => patchDraft({ secondaryHex: swatch })}
                  className={cn(
                    'h-11 w-11 rounded-full transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.secondaryHex.toLowerCase() === swatch
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-slate-300 hover:scale-105',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
              <input
                type="color"
                aria-label={t('ajustes.customColor')}
                value={draft.secondaryHex || '#f5c542'}
                onChange={(e) => patchDraft({ secondaryHex: e.target.value })}
                className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ secondaryHex: '' })}>
                {t('ajustes.clearColor')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('accent')}>
            <legend className="font-medium">{t('ajustes.accentColor')}</legend>
            <p className="text-sm text-muted">{t('ajustes.accentColorHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ajustes.accentColor')}>
              {BRAND_SECONDARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.accentColorHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'ajustes.accentColor')}
                  onClick={() => patchDraft({ accentColorHex: swatch })}
                  className={cn(
                    'h-11 w-11 rounded-full transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.accentColorHex.toLowerCase() === swatch
                      ? 'ring-2 ring-primary ring-offset-2'
                      : 'ring-1 ring-slate-300 hover:scale-105',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
              <input
                type="color"
                aria-label={t('ajustes.customColor')}
                value={draft.accentColorHex || '#9d8bda'}
                onChange={(e) => patchDraft({ accentColorHex: e.target.value })}
                className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ accentColorHex: '' })}>
                {t('ajustes.clearColor')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('splitColors')}>
            <legend className="font-medium">{t('ajustes.semanticColors')}</legend>
            <p className="text-sm text-muted">{t('ajustes.semanticColorsHint')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.successColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('ajustes.successColor')}
                    value={draft.successHex || '#10b981'}
                    onChange={(e) => patchDraft({ successHex: e.target.value })}
                    className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ successHex: '' })}>
                    {t('ajustes.clearColor')}
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.warningColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('ajustes.warningColor')}
                    value={draft.warningHex || '#f59e0b'}
                    onChange={(e) => patchDraft({ warningHex: e.target.value })}
                    className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ warningHex: '' })}>
                    {t('ajustes.clearColor')}
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('ajustes.errorColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('ajustes.errorColor')}
                    value={draft.errorHex || '#ef4444'}
                    onChange={(e) => patchDraft({ errorHex: e.target.value })}
                    className="h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ errorHex: '' })}>
                    {t('ajustes.clearColor')}
                  </Button>
                </div>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('font')}>
            <legend className="font-medium">{t('ajustes.typography')}</legend>
            <p className="text-sm text-muted">{t('ajustes.typographyHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.typography')}>
              {TYPOGRAPHY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.typography === option.id}
                  onClick={() => patchDraft({ typography: option.id })}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.typography === option.id ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  <span style={{ fontFamily: option.fontFamily }} className="text-base">Aa</span>
                  {t(option.labelKey as I18nKey)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('accent') || locked('splitColors')}>
            <legend className="font-medium">{t('ajustes.palettesTitle')}</legend>
            <p className="text-sm text-muted">{t('ajustes.palettesHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.palettesTitle')}>
              {BRAND_PALETTES.map((palette) => {
                const active =
                  draft.accentHex.toLowerCase() === palette.primary &&
                  draft.secondaryHex.toLowerCase() === palette.secondary
                return (
                  <button
                    key={palette.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={t(`ajustes.palette${palette.id.charAt(0).toUpperCase()}${palette.id.slice(1)}` as I18nKey)}
                    onClick={() => patchDraft({ accentHex: palette.primary, secondaryHex: palette.secondary })}
                    className={cn(
                      'flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                      active ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                    )}
                  >
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: palette.primary }} aria-hidden="true" />
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: palette.secondary }} aria-hidden="true" />
                    {t(`ajustes.palette${palette.id.charAt(0).toUpperCase()}${palette.id.slice(1)}` as I18nKey)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('intensity')}>
            <legend className="font-medium">{t('ajustes.intensityTitle')}</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.intensityTitle')}>
              {INTENSITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.intensity === option.id}
                  onClick={() => patchDraft({ intensity: option.id })}
                  className={cn(
                    'h-11 rounded-xl border px-4 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.intensity === option.id ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  {t(option.labelKey as I18nKey)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('gradientStyle')}>
            <legend className="font-medium">{t('ajustes.gradientTitle')}</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.gradientTitle')}>
              {GRADIENT_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.gradientStyle === option.id}
                  onClick={() => patchDraft({ gradientStyle: option.id })}
                  className={cn(
                    'h-11 rounded-xl border px-4 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.gradientStyle === option.id ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  {t(option.labelKey as I18nKey)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('icon')}>
            <legend className="font-medium">{t('ajustes.cover')}</legend>
            <p className="text-sm text-muted">{t('ajustes.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.cover')}>
              <button
                type="button"
                aria-pressed={draft.cover === NO_COVER}
                aria-label={t('ajustes.coverNone')}
                onClick={() => patchDraft({ cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  draft.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                )}
              >
                {t('ajustes.coverNone')}
              </button>
              {GROUP_COVER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={t('ajustes.coverEmojiLabel', { emoji })}
                  aria-pressed={draft.cover === emoji}
                  onClick={() => patchDraft({ cover: emoji })}
                  className={cn(
                    'grid h-11 min-w-11 place-items-center rounded-xl border px-2 text-xl transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.cover === emoji ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
              {GROUP_COVER_GRADIENTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(GRADIENT_NAME_KEYS[id] ?? 'ajustes.cover')}
                  aria-pressed={draft.cover === `gradient:${id}`}
                  onClick={() => patchDraft({ cover: `gradient:${id}` })}
                  className={cn(
                    'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.cover === `gradient:${id}` ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:opacity-90',
                  )}
                  style={groupCoverStyle(`gradient:${id}`, previewAccent)}
                >
                  {t(GRADIENT_NAME_KEYS[id] ?? 'ajustes.cover')}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ajustes.uploadLogo')}</p>
              <p className="text-xs text-muted">{t('ajustes.imageHint')}</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isOwner || locked('logo') || uploading !== null}
                aria-label={t('ajustes.uploadLogo')}
                onChange={(e) => void onUploadImage('logo', e)}
              />
              {uploading === 'logo' ? <p aria-live="polite" className="text-xs text-muted">{t('ajustes.uploading')}</p> : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ajustes.uploadBanner')}</p>
              <p className="text-xs text-muted">{t('ajustes.imageHint')}</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isOwner || locked('banner') || uploading !== null}
                aria-label={t('ajustes.uploadBanner')}
                onChange={(e) => void onUploadImage('banner', e)}
              />
              {uploading === 'banner' ? <p aria-live="polite" className="text-xs text-muted">{t('ajustes.uploading')}</p> : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ajustes.uploadFavicon')}</p>
              <p className="text-xs text-muted">{t('ajustes.faviconHint')}</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isOwner || uploading !== null}
                aria-label={t('ajustes.uploadFavicon')}
                onChange={(e) => void onUploadImage('favicon', e)}
              />
              {uploading === 'favicon' ? <p aria-live="polite" className="text-xs text-muted">{t('ajustes.uploading')}</p> : null}
            </div>
          </div>

          {isOwner && brandSaved ? (
            <span aria-live="polite" className="text-sm text-muted">
              {t('ajustes.brandingSaved')}
            </span>
          ) : null}

          {/* Discord-style floating save bar while there are unsaved changes. */}
          {isOwner && isDirty ? (
            <div
              role="status"
              data-testid="brand-unsaved-bar"
              className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3 shadow-xl md:bottom-4"
            >
              <p className="min-w-0 flex-1 text-sm font-medium text-ink">
                {t('ajustes.unsavedChanges')}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={savingBrand}
                onClick={() => {
                  if (branding) {
                    setDraft(draftFromBranding(branding))
                    setBrandSaved(false)
                  }
                }}
              >
                {t('ajustes.discardChanges')}
              </Button>
              <Button type="button" size="sm" disabled={savingBrand} onClick={() => void onSaveBranding()}>
                {savingBrand ? t('inicio.working') : t('ajustes.saveBranding')}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Legacy device-local appearance: only when server branding is unavailable (flag off). */}
      {activeTab === 'branding' && !brandingEnabled ? (
        <>
          <div
            className="overflow-hidden rounded-2xl"
            role="img"
            aria-label={t('grupo.coverArt')}
            style={groupCoverStyle(appearance.cover, appearance.accent)}
          >
            <div className="flex items-center gap-4 px-5 py-5">
              <span
                className={cn(
                  'grid h-14 w-14 shrink-0 place-items-center rounded-xl text-3xl font-semibold',
                  isNoneCover(appearance.cover) ? 'bg-black/5 text-ink' : 'bg-black/25',
                )}
                aria-hidden="true"
              >
                {isGradientCover(appearance.cover) || isNoneCover(appearance.cover)
                  ? group.name.slice(0, 1).toUpperCase()
                  : appearance.cover}
              </span>
              <p
                className={cn(
                  'truncate text-2xl font-semibold tracking-tight',
                  coverUsesLightText(appearance.cover) ? 'text-white' : 'text-ink',
                )}
              >
                {group.name}
              </p>
            </div>
          </div>

          <fieldset className="space-y-3" disabled={!isOwner}>
            <legend className="font-medium">{t('ajustes.accent')}</legend>
            <p className="text-sm text-muted">{t('ajustes.accentHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.accent')}>
              {GROUP_ACCENT_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={appearance.accent === swatch}
                  aria-label={t(ACCENT_NAME_KEYS[swatch] ?? 'ajustes.accent')}
                  onClick={() => update({ ...appearance, accent: swatch })}
                  className={cn(
                    'h-11 w-11 rounded-full transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    appearance.accent === swatch ? 'ring-2 ring-primary ring-offset-2' : 'ring-1 ring-slate-300 hover:scale-105',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner}>
            <legend className="font-medium">{t('ajustes.cover')}</legend>
            <p className="text-sm text-muted">{t('ajustes.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.cover')}>
              <button
                type="button"
                aria-pressed={appearance.cover === NO_COVER}
                aria-label={t('ajustes.coverNone')}
                onClick={() => update({ ...appearance, cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  appearance.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                )}
              >
                {t('ajustes.coverNone')}
              </button>
              {GROUP_COVER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={t('ajustes.coverEmojiLabel', { emoji })}
                  aria-pressed={appearance.cover === emoji}
                  onClick={() => update({ ...appearance, cover: emoji })}
                  className={cn(
                    'grid h-11 min-w-11 place-items-center rounded-xl border px-2 text-xl transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    appearance.cover === emoji ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
              {GROUP_COVER_GRADIENTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(GRADIENT_NAME_KEYS[id] ?? 'ajustes.cover')}
                  aria-pressed={appearance.cover === `gradient:${id}`}
                  onClick={() => update({ ...appearance, cover: `gradient:${id}` })}
                  className={cn(
                    'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    appearance.cover === `gradient:${id}` ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:opacity-90',
                  )}
                  style={groupCoverStyle(`gradient:${id}`, appearance.accent)}
                >
                  {t(GRADIENT_NAME_KEYS[id] ?? 'ajustes.cover')}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-muted">{t('ajustes.logoNote')}</p>

          {saved ? (
            <p aria-live="polite" className="text-sm text-muted">
              {t('ajustes.saved')}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Permissions tab */}
      {activeTab === 'permissions' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('roles.subtitle')}</p>
          <Link to={`/groups/${group.id}/roles`}>
            <Button variant="secondary">{t('roles.title')}</Button>
          </Link>
        </div>
      ) : null}

      {/* Notifications tab */}
      {activeTab === 'notifications' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('ajustes.notificationsComingSoon')}</p>
        </div>
      ) : null}

      {/* Integrations tab */}
      {activeTab === 'integrations' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('ajustes.integrationsComingSoon')}</p>
        </div>
      ) : null}

      {/* Advanced tab */}
      {activeTab === 'advanced' && brandingEnabled && draft ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('ajustes.tabAdvanced')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('ajustes.themeDefault')}</span>
              <select
                className={fieldClass}
                value={draft.themeDefault}
                disabled={!isOwner}
                onChange={(e) => patchDraft({ themeDefault: e.target.value })}
              >
                <option value="system">{t('ajustes.themeSystem')}</option>
                <option value="light">{t('ajustes.themeLight')}</option>
                <option value="dark">{t('ajustes.themeDark')}</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">{t('ajustes.localeDefault')}</span>
              <select
                className={fieldClass}
                value={draft.defaultLocale}
                disabled={!isOwner}
                onChange={(e) => patchDraft({ defaultLocale: e.target.value })}
              >
                <option value="es">{t('ajustes.localeEs')}</option>
                <option value="en">{t('ajustes.localeEn')}</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {/* Danger Zone tab */}
      {activeTab === 'danger' && isOwner ? (
        <section
          aria-labelledby="ajustes-danger-heading"
          className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
        >
          <h2 id="ajustes-danger-heading" className="text-lg font-semibold text-error-ink">
            {t('inicio.deleteTitle')}
          </h2>
          <ProblemAlert message={deleteError} />
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t('inicio.deleteTitle')}
          </Button>
          <ConfirmDialog
            open={deleteOpen}
            title={t('inicio.deleteDialogTitle')}
            confirmLabel={t('inicio.deleteTitle')}
            cancelLabel={t('inicio.cancel')}
            pendingLabel={t('inicio.deleting')}
            pending={deleting}
            onConfirm={() => void onConfirmDelete()}
            onCancel={() => {
              if (!deleting) setDeleteOpen(false)
            }}
          >
            <p>{t('inicio.deleteBody')}</p>
          </ConfirmDialog>
        </section>
      ) : null}
    </section>
  )
}
