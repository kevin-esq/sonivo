import { routes } from '../routing/routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bell, PlugZap } from 'lucide-react'
import {
  ApiError,
  deleteGroup,
  fetchFeatures,
  getGroup,
  getGroupBranding,
  getGroupNotificationPreferences,
  getGroupUsage,
  problemDetail,
  updateGroup,
  updateGroupBranding,
  updateGroupNotificationPreferences,
  uploadGroupBrandingImage,
  uploadGroupBrandingFavicon,
  type BrandingCapabilities,
  type CurrentUser,
  type GroupBranding,
  type GroupDetail,
  type GroupUsage,
  type GroupNotificationPreferences,
} from '../api/client'
import { BRAND_THEMES, GRADIENT_STYLES, INTENSITY_OPTIONS, TYPOGRAPHY_OPTIONS, deriveGroupThemeTokens } from '../brand/tokens'
import { useBrandPreview, type BrandDraft } from './brandPreview'
import { GroupAuditPanel } from '../groups/GroupAuditPanel'
import { useTheme } from '../brand/theme'
import { useT, type I18nKey } from '../i18n'
import {
  ConfirmDialog,
  ConflictAlert,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
} from '../repertoire/ui'
import { Button } from '../ui/button'
import { cn } from '../ui/cn'
import { FileDropzone } from '../ui/FileDropzone'
import { fieldClass } from '../ui/field'
import {
  GROUP_ACCENT_PRESETS,
  GROUP_COVER_GRADIENTS,
  GROUP_COVER_PRESETS,
  NO_COVER,
  coverUsesLightText,
  groupCoverStyle,
  isGradientCover,
  isNoneCover,
  isPresetCover,
  readGroupAppearance,
  writeGroupAppearance,
  type GroupAppearance,
} from './groupAccent'
import { notifyGroupUpdated } from './groupEvents'

/** Accessible colour names for the accent swatches (values stay hex). */
const ACCENT_NAME_KEYS: Record<string, I18nKey> = {
  '#8366f1': 'settings.accentViolet',
  '#0ea5e9': 'settings.accentSky',
  '#10b981': 'settings.accentEmerald',
  '#f3b626': 'settings.accentAmber',
  '#ef4444': 'settings.accentRed',
  '#e8c4f6': 'settings.accentLilac',
}

/**
 * Server-validated primary swatches (ADR-0048/0054): each meets WCAG AA against
 * white so the accent can back white header/nav text. The legacy device-local
 * presets (`GROUP_ACCENT_PRESETS`) are decorative and are NOT all AA-safe.
 */
const BRAND_PRIMARY_PRESETS = ['#6d4ee0', '#0369a1', '#047857', '#b45309', '#b91c1c', '#7e22ce'] as const
const BRAND_IMAGE_MAX_BYTES = 2 * 1024 * 1024

/** Secondary swatches: each meets AA with either white or near-black ink. */
const BRAND_SECONDARY_PRESETS = ['#0ea5e9', '#10b981', '#f3b626', '#ef4444', '#e8c4f6', '#a78bfa'] as const

const BRAND_COLOR_NAME_KEYS: Record<string, I18nKey> = {
  '#6d4ee0': 'settings.accentViolet',
  '#0369a1': 'settings.accentSky',
  '#047857': 'settings.accentEmerald',
  '#b45309': 'settings.accentAmber',
  '#b91c1c': 'settings.accentRed',
  '#7e22ce': 'settings.accentLilac',
  '#0ea5e9': 'settings.accentSky',
  '#10b981': 'settings.accentEmerald',
  '#f3b626': 'settings.accentAmber',
  '#ef4444': 'settings.accentRed',
  '#e8c4f6': 'settings.accentLilac',
  '#a78bfa': 'settings.accentLilac',
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
  violet: 'settings.coverGradientViolet',
  ocean: 'settings.coverGradientOcean',
  forest: 'settings.coverGradientForest',
  sunset: 'settings.coverGradientSunset',
}

const COVER_PRESET_NAME_KEYS: Record<(typeof GROUP_COVER_PRESETS)[number], I18nKey> = {
  soundwave: 'settings.coverPresetSoundwave',
  stage: 'settings.coverPresetStage',
  vinyl: 'settings.coverPresetVinyl',
  choir: 'settings.coverPresetChoir',
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
  if (branding.coverKind === 'preset' && branding.coverValue) return `preset:${branding.coverValue}`
  if (branding.coverKind === 'emoji' && branding.coverValue) return branding.coverValue
  return NO_COVER
}

function coverToBranding(cover: string): { coverKind: string | null; coverValue: string | null } {
  if (cover === NO_COVER) return { coverKind: null, coverValue: null }
  if (cover.startsWith('gradient:')) return { coverKind: 'gradient', coverValue: cover.slice('gradient:'.length) }
  if (cover.startsWith('preset:')) return { coverKind: 'preset', coverValue: cover.slice('preset:'.length) }
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

type SettingsTab = 'general' | 'branding' | 'plan' | 'permissions' | 'notifications' | 'integrations' | 'audit' | 'danger'

// Membership/billing is account-level (see /account/membership), not group-owned;
// the group centre only exposes group-scoped settings.
const SETTINGS_TABS: { id: SettingsTab; labelKey: I18nKey }[] = [
  { id: 'general', labelKey: 'settings.tabGeneral' },
  { id: 'branding', labelKey: 'settings.tabBranding' },
  { id: 'plan', labelKey: 'settings.tabPlan' },
  { id: 'permissions', labelKey: 'settings.tabPermissions' },
  { id: 'notifications', labelKey: 'settings.tabNotifications' },
  { id: 'integrations', labelKey: 'settings.tabIntegrations' },
  { id: 'audit', labelKey: 'audit.tab' },
  { id: 'danger', labelKey: 'settings.tabDanger' },
]

const SETTINGS_TAB_GROUPS: { labelKey: I18nKey; ids: SettingsTab[] }[] = [
  { labelKey: 'settings.navIdentity', ids: ['general', 'branding'] },
  { labelKey: 'settings.navOperation', ids: ['plan', 'permissions', 'notifications', 'integrations'] },
  { labelKey: 'settings.navAdministration', ids: ['audit', 'danger'] },
]

/** Human-readable byte size for the storage usage row. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

export function GroupSettingsPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { t } = useT()
  const { draft: preservedBrandDraft, setDraft: setBrandPreview } = useBrandPreview()
  const preservedBrandDraftRef = useRef(preservedBrandDraft)
  useEffect(() => {
    preservedBrandDraftRef.current = preservedBrandDraft?.groupId === groupId ? preservedBrandDraft : null
  }, [preservedBrandDraft, groupId])
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<GroupAppearance>(() => readGroupAppearance(groupId))
  const [saved, setSaved] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameConflict, setRenameConflict] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') as SettingsTab | null
  const [activeTab, setActiveTabState] = useState<SettingsTab>(
    requestedTab && SETTINGS_TABS.some((tab) => tab.id === requestedTab) ? requestedTab : 'general',
  )
  // Tabs are URL-addressable so the plan-limit upgrade CTA can deep-link here.
  const setActiveTab = (tab: SettingsTab) => {
    setActiveTabState(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === 'general') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }
  const [usage, setUsage] = useState<GroupUsage | null>(null)
  const [notificationPreferences, setNotificationPreferences] = useState<GroupNotificationPreferences | null>(null)
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false)
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false)
  const [notificationPreferencesError, setNotificationPreferencesError] = useState<string | null>(null)
  const [notificationPreferencesSaved, setNotificationPreferencesSaved] = useState(false)

  useEffect(() => {
    if (!groupId || activeTab !== 'notifications') return
    let cancelled = false
    setNotificationPreferencesLoading(true)
    setNotificationPreferencesError(null)
    getGroupNotificationPreferences(groupId)
      .then((result) => {
        if (!cancelled) setNotificationPreferences(result)
      })
      .catch((err) => {
        if (!cancelled) setNotificationPreferencesError(problemDetail(err, t))
      })
      .finally(() => {
        if (!cancelled) setNotificationPreferencesLoading(false)
      })
    return () => { cancelled = true }
  }, [groupId, activeTab, t])

  const saveNotificationPreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupId || !notificationPreferences) return
    setNotificationPreferencesSaving(true)
    setNotificationPreferencesSaved(false)
    setNotificationPreferencesError(null)
    try {
      await updateGroupNotificationPreferences(groupId, notificationPreferences)
      setNotificationPreferencesSaved(true)
    } catch (err) {
      setNotificationPreferencesError(problemDetail(err, t))
    } finally {
      setNotificationPreferencesSaving(false)
    }
  }

  useEffect(() => {
    if (
      group &&
      !isOwnerRole(group.role) &&
      (activeTab === 'audit' || activeTab === 'danger')
    ) {
      setActiveTab('general')
    }
  }, [group, activeTab])

  useEffect(() => {
    if (!groupId) return
    let cancelled = false
    getGroupUsage(groupId)
      .then((result) => {
        if (!cancelled) setUsage(result)
      })
      .catch(() => {
        if (!cancelled) setUsage(null)
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

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
  const [pendingImages, setPendingImages] = useState<
    Partial<Record<'logo' | 'banner' | 'favicon', { file: File; url: string }>>
  >(() => preservedBrandDraftRef.current?.pendingImages ?? {})

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

  // Publish the complete draft so the shell keeps it available across routes.
  const isDirty = useMemo(() => {
    if (!draft || !branding) return Object.keys(pendingImages).length > 0
    const current = draftFromBranding(branding)
    return JSON.stringify(draft) !== JSON.stringify(current) || Object.keys(pendingImages).length > 0
  }, [draft, branding, pendingImages])
  const renameDirty = Boolean(group && renameName.trim() !== group.name)
  useEffect(() => {
    if (!draft || !branding || !groupId || !group || !isOwnerRole(group.role)) return
    setBrandPreview({
      groupId,
      groupName: renameName.trim() || group.name,
      editor: draft,
      pendingImages,
      tokens: componentPreviewTokens,
      displayName: draft.displayName,
      tagline: draft.tagline,
      verse: draft.verse,
      cover: draft.cover,
      savedCover: coverFromBranding(branding),
      savedBannerUrl: branding.bannerUrl,
      dirty: isDirty || renameDirty,
      save: async () => {
        if (renameDirty && !renameSaved) {
          const renameErrorMessage = await saveGroupName()
          if (renameErrorMessage) return renameErrorMessage
          renameSaved = true
        }
        return isDirty ? onSaveBranding() : null
      },
      discard: () => {
        setDraft(draftFromBranding(branding))
        setRenameName(group.name)
        Object.values(pendingImages).forEach((image) => image && URL.revokeObjectURL(image.url))
        setPendingImages({})
        setBrandSaved(false)
      },
    })
    let renameSaved = false
  }, [draft, branding, groupId, group, group?.role, renameName, componentPreviewTokens, isDirty, renameDirty, pendingImages, setBrandPreview])

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
      setBranding(null)
      setDraft(null)
      setPendingImages((previous) => {
        Object.values(previous).forEach((image) => image && URL.revokeObjectURL(image.url))
        return preservedBrandDraftRef.current?.groupId === groupId
          ? preservedBrandDraftRef.current.pendingImages
          : {}
      })
      try {
        const result = await getGroup(groupId)
        if (!cancelled) {
          setGroup(result)
          setRenameName(
            preservedBrandDraftRef.current?.groupId === groupId
              ? preservedBrandDraftRef.current.groupName
              : result.name,
          )
        }
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError(t('common.groupNotFoundOrNoAccess'))
        } else {
          setError(problemDetail(err, t))
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
        const preservedDraft = preservedBrandDraftRef.current
        setDraft(
          preservedDraft && preservedDraft.groupId === groupId
            ? preservedDraft.editor
            : draftFromBranding(result),
        )
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

  /**
   * Controlled `input[type=color]` is unreliable: the browser fires a change for
   * every step while the OS picker is dragged, and each one previously scheduled
   * a state update, so a fast drag exceeded React's nested-update limit
   * ("Maximum update depth exceeded"). Coalesce a burst into one update per frame
   * and ignore non-hex / unchanged values.
   */
  const pendingColors = useRef<Partial<BrandDraft>>({})
  const colorFrame = useRef<number | null>(null)

  function setDraftColor(field: keyof BrandDraft, value: string) {
    const next = value.toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(next)) return
    if (String(draft?.[field] ?? '').toLowerCase() === next) return
    pendingColors.current = { ...pendingColors.current, [field]: next }
    if (colorFrame.current != null) return
    colorFrame.current = window.requestAnimationFrame(() => {
      colorFrame.current = null
      const pending = pendingColors.current
      pendingColors.current = {}
      if (Object.keys(pending).length === 0) return
      setDraft((prev) => (prev ? ({ ...prev, ...pending } as BrandDraft) : prev))
      setBrandSaved(false)
    })
  }

  useEffect(
    () => () => {
      if (colorFrame.current != null) window.cancelAnimationFrame(colorFrame.current)
    },
    [],
  )

  async function saveGroupName(): Promise<string | null> {
    if (!groupId || !group || !renameDirty) return null
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
      return null
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setRenameConflict(t('common.errorConflict'))
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setRenameError(mutationErrorMessage(reloadErr, t))
        }
      } else {
        setRenameError(mutationErrorMessage(err, t))
      }
      return mutationErrorMessage(err, t)
    }
  }

  async function onSaveBranding(): Promise<string | null> {
    if (!group || !branding || !draft || !isOwnerRole(group.role)) return t('common.errorGeneral')
    setSavingBrand(true)
    setBrandError(null)
    setBrandConflict(null)
    // Echo the currently-saved value for gated fields when the plan forbids them,
    // so a lower plan preserves (rather than clears) advanced configuration.
    const saved = draftFromBranding(branding)
    const cover = coverToBranding(can('icon') ? draft.cover : saved.cover)
    try {
      let currentBranding = branding
      for (const kind of ['logo', 'banner', 'favicon'] as const) {
        const pending = pendingImages[kind]
        if (!pending) continue
        currentBranding = kind === 'favicon'
          ? await uploadGroupBrandingFavicon(group.id, pending.file)
          : await uploadGroupBrandingImage(group.id, kind, pending.file)
      }
      const updated = await updateGroupBranding(group.id, {
        expectedVersion: currentBranding.version,
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
      Object.values(pendingImages).forEach((pending) => {
        if (pending) URL.revokeObjectURL(pending.url)
      })
      setPendingImages({})
      setBrandSaved(true)
      notifyGroupUpdated()
      return null
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBrandConflict(t('common.errorConflict'))
        try {
          const latest = await getGroupBranding(group.id)
          setBranding(latest)
          setDraft(draftFromBranding(latest))
        } catch (reloadErr) {
          setBrandError(mutationErrorMessage(reloadErr, t))
        }
      } else {
        setBrandError(mutationErrorMessage(err, t))
      }
      return mutationErrorMessage(err, t)
    } finally {
      setSavingBrand(false)
    }
  }

  function onUploadImage(kind: 'logo' | 'banner' | 'favicon', file: File | null) {
    if (!file || !group) return
    const url = URL.createObjectURL(file)
    setPendingImages((current) => {
      const previous = current[kind]
      if (previous) URL.revokeObjectURL(previous.url)
      return { ...current, [kind]: { file, url } }
    })
    setBrandSaved(false)
    setBrandError(null)
  }

  function removePendingImage(kind: 'logo' | 'banner' | 'favicon') {
    const previous = pendingImages[kind]
    if (previous) URL.revokeObjectURL(previous.url)
    setPendingImages((current) => {
      const next = { ...current }
      delete next[kind]
      return next
    })
    setBrandSaved(false)
    setBrandError(null)
  }

  async function onConfirmDelete() {
    if (!groupId || !group) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroup(group.id, group.version)
      setDeleteOpen(false)
      navigate(routes.home)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleteError(t('common.errorConflict'))
        try {
          const latest = await getGroup(group.id)
          setGroup(latest)
          setRenameName(latest.name)
        } catch (reloadErr) {
          setDeleteError(mutationErrorMessage(reloadErr, t))
        }
      } else {
        setDeleteError(mutationErrorMessage(err, t))
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
        <Link className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
          {t('workspace.myGroups')}
        </Link>
      </div>
    )
  }

  const isOwner = isOwnerRole(group.role)
  const visibleSettingsTabs = SETTINGS_TABS.filter(
    (tab) => isOwner || (tab.id !== 'audit' && tab.id !== 'danger'),
  )
  const visibleSettingsTabGroups = SETTINGS_TAB_GROUPS
    .map((group) => ({ ...group, tabs: visibleSettingsTabs.filter((tab) => group.ids.includes(tab.id)) }))
    .filter((group) => group.tabs.length > 0)
  const previewAccent = draft?.accentHex || '#8366f1'
  const previewHeaderStyle = pendingImages.banner
    ? {
        backgroundImage: `linear-gradient(rgba(15,23,42,0.56), rgba(15,23,42,0.56)), url(${pendingImages.banner.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : branding?.bannerUrl && draft?.cover === coverFromBranding(branding)
    ? {
        backgroundImage: `linear-gradient(rgba(15,23,42,0.56), rgba(15,23,42,0.56)), url(${branding.bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : groupCoverStyle(draft?.cover ?? NO_COVER, previewAccent)

  return (
    <section className="max-w-4xl space-y-6" aria-labelledby="ajustes-heading">
      <div className="space-y-1">
        <h1 id="ajustes-heading" className="text-2xl font-bold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-sm text-muted">{t('settings.subtitle')}</p>
      </div>

      {isOwner ? (
        <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm">{t('settings.ownerHint')}</p>
      ) : (
        <p role="note" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm">
          {t('settings.memberReadonly')}
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
      {/* Settings navigation */}
      <div
        className="flex gap-4 overflow-x-auto rounded-xl bg-surface-hover p-2 md:sticky md:top-4 md:flex-col md:overflow-visible"
        role="tablist"
        aria-label={t('settings.tabsLabel')}
        onKeyDown={(event) => {
          const currentIndex = visibleSettingsTabs.findIndex((tab) => tab.id === activeTab)
          let nextIndex = currentIndex
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % visibleSettingsTabs.length
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + visibleSettingsTabs.length) % visibleSettingsTabs.length
          else if (event.key === 'Home') nextIndex = 0
          else if (event.key === 'End') nextIndex = visibleSettingsTabs.length - 1
          else return
          event.preventDefault()
          const nextTab = visibleSettingsTabs[nextIndex]
          if (nextTab) {
            setActiveTab(nextTab.id)
            document.getElementById(`settings-tab-${nextTab.id}`)?.focus()
          }
        }}
      >
        {visibleSettingsTabGroups.map((group) => (
          <div key={group.labelKey} className="flex shrink-0 gap-1 md:flex-col">
            <p className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted md:block">
              {t(group.labelKey)}
            </p>
            {group.tabs.map((tab) => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="settings-panel"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'min-h-11 rounded-lg px-3 py-2 text-left text-sm font-semibold whitespace-nowrap transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none md:w-full',
                  activeTab === tab.id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
                  tab.id === 'danger' && activeTab !== 'danger' ? 'text-error-ink hover:text-error-ink' : '',
                )}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${activeTab}`} tabIndex={0}>
      {/* General tab */}
      {activeTab === 'general' ? (
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
                onChange={(e) => setRenameName(e.target.value)}
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
                  disabled={!isOwner || locked('brandName')}
                  maxLength={120}
                  onChange={(e) => patchDraft({ displayName: e.target.value })}
                />
                <span className="text-xs text-muted">{t('settings.displayNameHint')}</span>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('settings.welcomeText')}</span>
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
                <span className="text-sm font-medium text-ink">{t('settings.loginHeadline')}</span>
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
                  <span className="text-sm font-medium text-ink">{t('settings.tagline')}</span>
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
                  <span className="text-sm font-medium text-ink">{t('settings.verse')}</span>
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
                {t('settings.showSonivoCredit')}
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
              {t('settings.brandingTitle')}
            </h2>
            <p className="text-sm text-muted">{t('settings.brandingSubtitle')}</p>
          </div>

          {planLimited ? (
            <div
              data-testid="brand-plan-lock"
              className="space-y-1 rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3"
            >
              <p className="text-sm font-semibold text-ink">{t('settings.planLockedTitle')}</p>
              <p className="text-sm text-muted">{t('settings.planLockedBody')}</p>
              <Link
                to={routes.accountMembership}
                className="inline-block text-sm font-semibold text-primary-ink no-underline hover:underline"
              >
                {t('settings.planUpgrade')}
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
                {pendingImages.logo || branding.logoUrl ? (
                  <img src={pendingImages.logo?.url ?? branding.logoUrl ?? ''} alt="" className="h-9 w-9 rounded object-contain" />
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

          {/* Component preview: buttons, nav, card and badge rendered with the
              same semantic tokens as the live workspace (draft-driven). */}
          <div
            data-testid="branding-component-preview"
            className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 font-sans"
            style={componentPreviewTokens as CSSProperties}
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

          <ConflictAlert message={brandConflict} />
          <ProblemAlert message={brandError} />

          {/* Contrast validation warning */}
          {draft.accentHex && contrastRatio(draft.accentHex, '#ffffff') < 4.5 ? (
            <p role="alert" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-ink">
              {t('settings.contrastWarning')}
            </p>
          ) : null}

          {/* Reset to Sonivo (spec §5.6): restores the default theme look while
              keeping the group's brand text. Always available. */}
          {isOwner ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          themeId: 'sonivo',
                          accentHex: '#8366f1',
                          secondaryHex: '#e8c4f6',
                          accentColorHex: '#9d8bda',
                          successHex: '',
                          warningHex: '',
                          errorHex: '',
                          typography: 'system',
                          intensity: 'medium',
                          gradientStyle: 'fixed',
                          cover: `preset:${GROUP_COVER_PRESETS[0]}`,
                        }
                      : current,
                  )
                  setBrandSaved(false)
                }}
              >
                {t('settings.resetToSonivo')}
              </Button>
            </div>
          ) : null}

          <fieldset className="space-y-3" disabled={!isOwner || locked('themes')}>
            <legend className="font-medium">{t('settings.themesTitle')}</legend>
            <p className="text-sm text-muted">{t('settings.themesHint')}</p>
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
              role="group"
              aria-label={t('settings.themesTitle')}
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
            <legend className="font-medium">{t('settings.primaryColor')}</legend>
            <p className="text-sm text-muted">{t('settings.colorHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('settings.primaryColor')}>
              {BRAND_PRIMARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.accentHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'settings.primaryColor')}
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
                aria-label={t('settings.customColor')}
                value={draft.accentHex || '#8366f1'}
                onChange={(e) => setDraftColor('accentHex', e.target.value)}
                className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('splitColors')}>
            <legend className="font-medium">{t('settings.secondaryColor')}</legend>
            <p className="text-sm text-muted">{t('settings.secondaryHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('settings.secondaryColor')}>
              {BRAND_SECONDARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.secondaryHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'settings.secondaryColor')}
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
                aria-label={t('settings.customColor')}
                value={draft.secondaryHex || '#f5c542'}
                onChange={(e) => setDraftColor('secondaryHex', e.target.value)}
                className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ secondaryHex: '' })}>
                {t('settings.clearColor')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('accent')}>
            <legend className="font-medium">{t('settings.accentColor')}</legend>
            <p className="text-sm text-muted">{t('settings.accentColorHint')}</p>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('settings.accentColor')}>
              {BRAND_SECONDARY_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={draft.accentColorHex.toLowerCase() === swatch}
                  aria-label={t(BRAND_COLOR_NAME_KEYS[swatch] ?? 'settings.accentColor')}
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
                aria-label={t('settings.customColor')}
                value={draft.accentColorHex || '#9d8bda'}
                onChange={(e) => setDraftColor('accentColorHex', e.target.value)}
                className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ accentColorHex: '' })}>
                {t('settings.clearColor')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('splitColors')}>
            <legend className="font-medium">{t('settings.semanticColors')}</legend>
            <p className="text-sm text-muted">{t('settings.semanticColorsHint')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('settings.successColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('settings.successColor')}
                    value={draft.successHex || '#10b981'}
                    onChange={(e) => setDraftColor('successHex', e.target.value)}
                    className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ successHex: '' })}>
                    {t('settings.clearColor')}
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('settings.warningColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('settings.warningColor')}
                    value={draft.warningHex || '#f59e0b'}
                    onChange={(e) => setDraftColor('warningHex', e.target.value)}
                    className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ warningHex: '' })}>
                    {t('settings.clearColor')}
                  </Button>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-ink">{t('settings.errorColor')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t('settings.errorColor')}
                    value={draft.errorHex || '#ef4444'}
                    onChange={(e) => setDraftColor('errorHex', e.target.value)}
                    className="color-picker-circle h-11 w-11 cursor-pointer rounded-full border border-border-subtle bg-transparent p-1"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ errorHex: '' })}>
                    {t('settings.clearColor')}
                  </Button>
                </div>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('font')}>
            <legend className="font-medium">{t('settings.typography')}</legend>
            <p className="text-sm text-muted">{t('settings.typographyHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.typography')}>
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
            <legend className="font-medium">{t('settings.palettesTitle')}</legend>
            <p className="text-sm text-muted">{t('settings.palettesHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.palettesTitle')}>
              {BRAND_PALETTES.map((palette) => {
                const active =
                  draft.accentHex.toLowerCase() === palette.primary &&
                  draft.secondaryHex.toLowerCase() === palette.secondary
                return (
                  <button
                    key={palette.id}
                    type="button"
                    aria-pressed={active}
                    aria-label={t(`settings.palette${palette.id.charAt(0).toUpperCase()}${palette.id.slice(1)}` as I18nKey)}
                    onClick={() => patchDraft({ accentHex: palette.primary, secondaryHex: palette.secondary })}
                    className={cn(
                      'flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                      active ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                    )}
                  >
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: palette.primary }} aria-hidden="true" />
                    <span className="h-5 w-5 rounded-full" style={{ backgroundColor: palette.secondary }} aria-hidden="true" />
                    {t(`settings.palette${palette.id.charAt(0).toUpperCase()}${palette.id.slice(1)}` as I18nKey)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('intensity')}>
            <legend className="font-medium">{t('settings.intensityTitle')}</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.intensityTitle')}>
              {INTENSITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draft.intensity === option.id}
                  onClick={() => patchDraft({ intensity: option.id })}
                  className={cn(
                    'flex h-14 min-w-28 items-center gap-2.5 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.intensity === option.id ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-full border border-black/10"
                    style={{
                      backgroundImage: `radial-gradient(circle at 30% 25%, ${draft.accentHex || '#8366f1'}${option.washAlpha}, transparent 72%)`,
                      backgroundColor: 'var(--color-canvas)',
                    }}
                    aria-hidden="true"
                  />
                  {t(option.labelKey as I18nKey)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner || locked('gradientStyle')}>
            <legend className="font-medium">{t('settings.gradientTitle')}</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.gradientTitle')}>
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
            <legend className="font-medium">{t('settings.cover')}</legend>
            <p className="text-sm text-muted">{t('settings.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.cover')}>
              <button
                type="button"
                aria-pressed={draft.cover === NO_COVER}
                aria-label={t('settings.coverNone')}
                onClick={() => patchDraft({ cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  draft.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                )}
              >
                {t('settings.coverNone')}
              </button>
              {GROUP_COVER_PRESETS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(COVER_PRESET_NAME_KEYS[id])}
                  aria-pressed={draft.cover === `preset:${id}`}
                  onClick={() => patchDraft({ cover: `preset:${id}` })}
                  className={cn(
                    'relative h-20 w-36 overflow-hidden rounded-xl border text-left text-sm font-semibold text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.cover === `preset:${id}` ? 'border-primary ring-2 ring-primary/35' : 'border-border-subtle hover:border-primary/50',
                  )}
                  style={groupCoverStyle(`preset:${id}`, previewAccent)}
                >
                  <span className="absolute inset-x-0 bottom-0 bg-slate-950/55 px-2.5 py-1.5">{t(COVER_PRESET_NAME_KEYS[id])}</span>
                </button>
              ))}
              {GROUP_COVER_GRADIENTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(GRADIENT_NAME_KEYS[id] ?? 'settings.cover')}
                  aria-pressed={draft.cover === `gradient:${id}`}
                  onClick={() => patchDraft({ cover: `gradient:${id}` })}
                  className={cn(
                    'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    draft.cover === `gradient:${id}` ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:opacity-90',
                  )}
                  style={groupCoverStyle(`gradient:${id}`, previewAccent)}
                >
                  {t(GRADIENT_NAME_KEYS[id] ?? 'settings.cover')}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <FileDropzone
                title={t('settings.uploadLogo')}
                description={t('settings.imageHint')}
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxSizeBytes={BRAND_IMAGE_MAX_BYTES}
                disabled={!isOwner || locked('logo')}
                file={pendingImages.logo?.file ?? null}
                onFileChange={(file) => file ? onUploadImage('logo', file) : removePendingImage('logo')}
                compact
              />
              {pendingImages.logo ? <p aria-live="polite" className="text-xs text-muted">{t('settings.imageReady')}</p> : null}
            </div>
            <div className="space-y-2">
              <FileDropzone
                title={t('settings.uploadBanner')}
                description={t('settings.imageHint')}
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxSizeBytes={BRAND_IMAGE_MAX_BYTES}
                disabled={!isOwner || locked('banner')}
                file={pendingImages.banner?.file ?? null}
                onFileChange={(file) => file ? onUploadImage('banner', file) : removePendingImage('banner')}
                compact
              />
              {pendingImages.banner ? <p aria-live="polite" className="text-xs text-muted">{t('settings.imageReady')}</p> : null}
            </div>
            <div className="space-y-2">
              <FileDropzone
                title={t('settings.uploadFavicon')}
                description={t('settings.faviconHint')}
                accept="image/png,image/jpeg,image/webp,image/gif"
                maxSizeBytes={BRAND_IMAGE_MAX_BYTES}
                disabled={!isOwner}
                file={pendingImages.favicon?.file ?? null}
                onFileChange={(file) => file ? onUploadImage('favicon', file) : removePendingImage('favicon')}
                compact
              />
              {pendingImages.favicon ? <p aria-live="polite" className="text-xs text-muted">{t('settings.imageReady')}</p> : null}
            </div>
          </div>

          {isOwner && brandSaved ? (
            <span aria-live="polite" className="text-sm text-muted">
              {t('settings.brandingSaved')}
            </span>
          ) : null}

        </section>
      ) : null}

      {/* Legacy device-local appearance: only when server branding is unavailable (flag off). */}
      {activeTab === 'branding' && !brandingEnabled ? (
        <>
          <div
            className="overflow-hidden rounded-2xl"
            role="img"
            aria-label={t('group.coverArt')}
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
                {isGradientCover(appearance.cover) || isPresetCover(appearance.cover) || isNoneCover(appearance.cover)
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
            <legend className="font-medium">{t('settings.accent')}</legend>
            <p className="text-sm text-muted">{t('settings.accentHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.accent')}>
              {GROUP_ACCENT_PRESETS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-pressed={appearance.accent === swatch}
                  aria-label={t(ACCENT_NAME_KEYS[swatch] ?? 'settings.accent')}
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
            <legend className="font-medium">{t('settings.cover')}</legend>
            <p className="text-sm text-muted">{t('settings.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.cover')}>
              <button
                type="button"
                aria-pressed={appearance.cover === NO_COVER}
                aria-label={t('settings.coverNone')}
                onClick={() => update({ ...appearance, cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  appearance.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                )}
              >
                {t('settings.coverNone')}
              </button>
              {GROUP_COVER_PRESETS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(COVER_PRESET_NAME_KEYS[id])}
                  aria-pressed={appearance.cover === `preset:${id}`}
                  onClick={() => update({ ...appearance, cover: `preset:${id}` })}
                  className={cn(
                    'h-20 w-36 rounded-xl border text-sm font-semibold text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    appearance.cover === `preset:${id}` ? 'border-primary ring-2 ring-primary/25' : 'border-border-subtle hover:border-primary/50',
                  )}
                  style={groupCoverStyle(`preset:${id}`, appearance.accent)}
                >
                  {t(COVER_PRESET_NAME_KEYS[id])}
                </button>
              ))}
              {GROUP_COVER_GRADIENTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={t(GRADIENT_NAME_KEYS[id] ?? 'settings.cover')}
                  aria-pressed={appearance.cover === `gradient:${id}`}
                  onClick={() => update({ ...appearance, cover: `gradient:${id}` })}
                  className={cn(
                    'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium text-white transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                    appearance.cover === `gradient:${id}` ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:opacity-90',
                  )}
                  style={groupCoverStyle(`gradient:${id}`, appearance.accent)}
                >
                  {t(GRADIENT_NAME_KEYS[id] ?? 'settings.cover')}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-muted">{t('settings.logoNote')}</p>

          {saved ? (
            <p aria-live="polite" className="text-sm text-muted">
              {t('settings.saved')}
            </p>
          ) : null}
        </>
      ) : null}

      {/* Permissions tab */}
      {activeTab === 'permissions' ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('roles.subtitle')}</p>
          <Link to={routes.groupRoles(group.id)}>
            <Button variant="secondary">{t('roles.title')}</Button>
          </Link>
        </div>
      ) : null}

      {/* Notifications tab */}
      {activeTab === 'notifications' ? (
        <section className="mx-auto max-w-xl rounded-3xl border border-border-subtle bg-surface px-6 py-8 sm:px-10" aria-labelledby="settings-notifications-title">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink" aria-hidden="true">
              <Bell className="h-6 w-6" />
            </span>
            <div>
              <h2 id="settings-notifications-title" className="text-xl font-semibold tracking-tight text-ink">{t('settings.tabNotifications')}</h2>
              <p className="mt-1 text-sm text-muted">{t('settings.notificationsSubtitle')}</p>
            </div>
          </div>
          {notificationPreferencesLoading ? (
            <p aria-live="polite" className="mt-6 text-sm text-muted">{t('settings.notificationsLoading')}</p>
          ) : notificationPreferences ? (
            <form className="mt-6 space-y-5" onSubmit={saveNotificationPreferences}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
                <input
                  className="mt-1 h-4 w-4 accent-primary"
                  type="checkbox"
                  checked={notificationPreferences.notifyRoleChanges}
                  onChange={(event) => {
                    setNotificationPreferences({ ...notificationPreferences, notifyRoleChanges: event.target.checked })
                    setNotificationPreferencesSaved(false)
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{t('settings.notifyRoleChanges')}</span>
                  <span className="mt-1 block text-sm text-muted">{t('settings.notifyRoleChangesDescription')}</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle p-4">
                <input
                  className="mt-1 h-4 w-4 accent-primary"
                  type="checkbox"
                  checked={notificationPreferences.notifyTaskAssignments}
                  onChange={(event) => {
                    setNotificationPreferences({ ...notificationPreferences, notifyTaskAssignments: event.target.checked })
                    setNotificationPreferencesSaved(false)
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{t('settings.notifyTaskAssignments')}</span>
                  <span className="mt-1 block text-sm text-muted">{t('settings.notifyTaskAssignmentsDescription')}</span>
                </span>
              </label>
              {notificationPreferencesSaved ? <p role="status" className="text-sm text-muted">{t('settings.saved')}</p> : null}
              {notificationPreferencesError ? <p role="alert" className="text-sm text-error-ink">{notificationPreferencesError}</p> : null}
              <Button type="submit" disabled={notificationPreferencesSaving}>
                {notificationPreferencesSaving ? t('profile.saving') : t('settings.saveNotifications')}
              </Button>
            </form>
          ) : (
            <p role="alert" className="mt-6 text-sm text-error-ink">{notificationPreferencesError ?? t('common.errorGeneral')}</p>
          )}
        </section>
      ) : null}

      {/* Integrations tab */}
      {activeTab === 'integrations' ? (
        <section className="mx-auto max-w-xl rounded-3xl border border-border-subtle bg-surface px-6 py-8 sm:px-10" aria-labelledby="settings-integrations-title">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-ink" aria-hidden="true">
              <PlugZap className="h-6 w-6" />
            </span>
            <div>
              <h2 id="settings-integrations-title" className="text-xl font-semibold tracking-tight text-ink">{t('settings.tabIntegrations')}</h2>
              <p className="mt-1 text-sm text-muted">{t('settings.calendarIntegrationTitle')}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-muted">{t('settings.calendarIntegrationHelp')}</p>
          <a
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={`/api/groups/${group.id}/calendar.ics`}
            download="sonivo-calendar.ics"
          >
            {t('settings.calendarDownload')}
          </a>
        </section>
      ) : null}

      {/* Plan tab (ADR-0071): effective plan + usage vs limits (spec §7). */}
      {activeTab === 'plan' ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('settings.planTitle')}</h2>
          {usage ? (
            <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5">
              <p className="text-sm font-semibold text-ink">
                {usage.planId === 'starter'
                  ? t('settings.planStarter')
                  : usage.planId === 'pro'
                    ? t('settings.planPro')
                    : t('settings.planStudio')}
              </p>
              <div className="space-y-3">
                {[
                  { key: 'members', label: t('settings.usageMembers'), metric: usage.members, bytes: false },
                  { key: 'songs', label: t('settings.usageSongs'), metric: usage.songs, bytes: false },
                  { key: 'setlists', label: t('settings.usageSetlists'), metric: usage.setlists, bytes: false },
                  { key: 'events', label: t('settings.usageEvents'), metric: usage.eventsThisMonth, bytes: false },
                  { key: 'storage', label: t('settings.usageStorage'), metric: usage.storageBytes, bytes: true },
                ].map((row) => (
                  <div key={row.key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">{row.label}</span>
                      <span className="text-muted">
                        {row.metric.limit === null
                          ? t('settings.usageUnlimited')
                          : `${row.bytes ? formatBytes(row.metric.used) : row.metric.used} / ${
                              row.bytes ? formatBytes(row.metric.limit) : row.metric.limit
                            }`}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full bg-primary-strong"
                        style={{
                          width:
                            row.metric.limit === null
                              ? '8%'
                              : `${Math.min(
                                  100,
                                  Math.round((row.metric.used / Math.max(1, row.metric.limit)) * 100),
                                )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Link
                to={routes.accountMembership}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-ink no-underline hover:underline"
              >
                {t('settings.changePlan')}
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('settings.usageLoading')}</p>
          )}
        </div>
      ) : null}

      {/* Audit tab (Owner only): append-only group activity log (ADR-0051). */}
      {activeTab === 'audit' && isOwner ? <GroupAuditPanel groupId={group.id} /> : null}

      {/* Danger Zone tab */}
      {activeTab === 'danger' && isOwner ? (
        <section
          aria-labelledby="ajustes-danger-heading"
          className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
        >
          <h2 id="ajustes-danger-heading" className="text-lg font-semibold text-error-ink">
            {t('dashboard.deleteTitle')}
          </h2>
          <ProblemAlert message={deleteError} />
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            {t('dashboard.deleteTitle')}
          </Button>
          <ConfirmDialog
            open={deleteOpen}
            title={t('dashboard.deleteDialogTitle')}
            confirmLabel={t('dashboard.deleteTitle')}
            cancelLabel={t('dashboard.cancel')}
            pendingLabel={t('dashboard.deleting')}
            pending={deleting}
            onConfirm={() => void onConfirmDelete()}
            onCancel={() => {
              if (!deleting) setDeleteOpen(false)
            }}
          >
            <p>{t('dashboard.deleteBody')}</p>
          </ConfirmDialog>
        </section>
      ) : null}
      </div>
      </div>
    </section>
  )
}
