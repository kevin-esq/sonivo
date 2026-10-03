import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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
  type CurrentUser,
  type GroupBranding,
  type GroupDetail,
} from '../api/client'
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
  cover: string
  themeDefault: string
  defaultLocale: string
  welcomeText: string
  loginHeadline: string
  tagline: string
  verse: string
  showSonivoCredit: boolean
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
    cover: coverFromBranding(branding),
    themeDefault: branding.themeDefault ?? 'system',
    defaultLocale: branding.defaultLocale ?? 'es',
    welcomeText: branding.welcomeText ?? '',
    loginHeadline: branding.loginHeadline ?? '',
    tagline: branding.tagline ?? '',
    verse: branding.verse ?? '',
    showSonivoCredit: branding.showSonivoCredit,
  }
}

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

  // Phase 4.3 / ADR-0054: server-side White Label editor behind Features:GroupBranding.
  const [brandingEnabled, setBrandingEnabled] = useState(false)
  const [branding, setBranding] = useState<GroupBranding | null>(null)
  const [draft, setDraft] = useState<BrandDraft | null>(null)
  const [savingBrand, setSavingBrand] = useState(false)
  const [brandSaved, setBrandSaved] = useState(false)
  const [brandError, setBrandError] = useState<string | null>(null)
  const [brandConflict, setBrandConflict] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null)

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
    const cover = coverToBranding(draft.cover)
    try {
      const updated = await updateGroupBranding(group.id, {
        expectedVersion: branding.version,
        displayName: draft.displayName.trim() || null,
        accentHex: draft.accentHex.trim() || null,
        secondaryHex: draft.secondaryHex.trim() || null,
        coverKind: cover.coverKind,
        coverValue: cover.coverValue,
        themeDefault: draft.themeDefault || null,
        defaultLocale: draft.defaultLocale || null,
        welcomeText: draft.welcomeText.trim() || null,
        loginHeadline: draft.loginHeadline.trim() || null,
        tagline: draft.tagline.trim() || null,
        verse: draft.verse.trim() || null,
        showSonivoCredit: draft.showSonivoCredit,
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

  async function onUploadImage(kind: 'logo' | 'banner', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !group) return
    setUploading(kind)
    setBrandError(null)
    try {
      const updated = await uploadGroupBrandingImage(group.id, kind, file)
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
    <section className="max-w-4xl space-y-8" aria-labelledby="ajustes-heading">
      <div className="space-y-1">
        <h1 id="ajustes-heading" className="text-2xl font-bold tracking-tight">
          {t('ajustes.title')}
        </h1>
        <p className="text-sm text-slate-500">{t('ajustes.subtitle')}</p>
      </div>

      {isOwner ? (
        <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-sm">{t('ajustes.ownerHint')}</p>
      ) : (
        <p role="note" className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-sm">
          {t('ajustes.memberReadonly')}
        </p>
      )}

      <form className="space-y-3" onSubmit={(event) => void onRename(event)} noValidate>
        <h2 className="text-lg font-semibold">{t('inicio.renameTitle')}</h2>
        <ConflictAlert message={renameConflict} />
        <ProblemAlert message={renameError} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('ajustes.name')}</span>
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

      {brandingEnabled && draft && branding ? (
        <section className="space-y-5" aria-labelledby="brand-heading" data-testid="branding-editor">
          <div className="space-y-1">
            <h2 id="brand-heading" className="text-lg font-semibold">
              {t('ajustes.brandingTitle')}
            </h2>
            <p className="text-sm text-slate-500">{t('ajustes.brandingSubtitle')}</p>
          </div>

          {/* Live preview: header with banner (or cover), logo and both brand colours. */}
          <div
            data-testid="branding-preview"
            className="overflow-hidden rounded-2xl"
            style={previewHeaderStyle}
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
                    'truncate text-2xl font-semibold tracking-tight',
                    branding.bannerUrl || coverUsesLightText(draft.cover) ? 'text-white' : 'text-ink',
                  )}
                >
                  {draft.displayName || group.name}
                </p>
                {draft.tagline || draft.welcomeText ? (
                  <p className="mt-0.5 truncate text-sm text-white/85">{draft.tagline || draft.welcomeText}</p>
                ) : null}
                {draft.verse ? (
                  <p className="mt-1 truncate text-xs italic text-white/70">{draft.verse}</p>
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
            </div>
          </div>

          <ConflictAlert message={brandConflict} />
          <ProblemAlert message={brandError} />

          <fieldset className="space-y-3" disabled={!isOwner}>
            <legend className="font-medium">{t('ajustes.primaryColor')}</legend>
            <p className="text-sm text-slate-500">{t('ajustes.colorHint')}</p>
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
                className="h-11 w-11 cursor-pointer rounded-full border border-slate-300 bg-transparent p-1"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner}>
            <legend className="font-medium">{t('ajustes.secondaryColor')}</legend>
            <p className="text-sm text-slate-500">{t('ajustes.secondaryHint')}</p>
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
                className="h-11 w-11 cursor-pointer rounded-full border border-slate-300 bg-transparent p-1"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => patchDraft({ secondaryHex: '' })}>
                {t('ajustes.clearColor')}
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3" disabled={!isOwner}>
            <legend className="font-medium">{t('ajustes.cover')}</legend>
            <p className="text-sm text-slate-500">{t('ajustes.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.cover')}>
              <button
                type="button"
                aria-pressed={draft.cover === NO_COVER}
                aria-label={t('ajustes.coverNone')}
                onClick={() => patchDraft({ cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  draft.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-slate-300 hover:border-primary/50',
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
                    draft.cover === emoji ? 'border-primary ring-2 ring-primary/25' : 'border-slate-300 hover:border-primary/50',
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

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ajustes.uploadLogo')}</p>
              <p className="text-xs text-slate-500">{t('ajustes.imageHint')}</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isOwner || uploading !== null}
                aria-label={t('ajustes.uploadLogo')}
                onChange={(e) => void onUploadImage('logo', e)}
              />
              {uploading === 'logo' ? <p aria-live="polite" className="text-xs text-slate-500">{t('ajustes.uploading')}</p> : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('ajustes.uploadBanner')}</p>
              <p className="text-xs text-slate-500">{t('ajustes.imageHint')}</p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!isOwner || uploading !== null}
                aria-label={t('ajustes.uploadBanner')}
                onChange={(e) => void onUploadImage('banner', e)}
              />
              {uploading === 'banner' ? <p aria-live="polite" className="text-xs text-slate-500">{t('ajustes.uploading')}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('ajustes.themeDefault')}</span>
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
              <span className="text-sm font-medium text-slate-700">{t('ajustes.localeDefault')}</span>
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

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('ajustes.displayNameOverride')}</span>
            <input
              className={fieldClass}
              type="text"
              data-testid="brand-display-name"
              value={draft.displayName}
              disabled={!isOwner}
              maxLength={120}
              onChange={(e) => patchDraft({ displayName: e.target.value })}
            />
            <span className="text-xs text-slate-500">{t('ajustes.displayNameHint')}</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('ajustes.welcomeText')}</span>
            <input
              className={fieldClass}
              type="text"
              value={draft.welcomeText}
              disabled={!isOwner}
              maxLength={500}
              onChange={(e) => patchDraft({ welcomeText: e.target.value })}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">{t('ajustes.loginHeadline')}</span>
            <input
              className={fieldClass}
              type="text"
              value={draft.loginHeadline}
              disabled={!isOwner}
              maxLength={500}
              onChange={(e) => patchDraft({ loginHeadline: e.target.value })}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('ajustes.tagline')}</span>
              <input
                className={fieldClass}
                type="text"
                value={draft.tagline}
                disabled={!isOwner}
                maxLength={160}
                onChange={(e) => patchDraft({ tagline: e.target.value })}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">{t('ajustes.verse')}</span>
              <input
                className={fieldClass}
                type="text"
                value={draft.verse}
                disabled={!isOwner}
                maxLength={200}
                onChange={(e) => patchDraft({ verse: e.target.value })}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.showSonivoCredit}
              disabled={!isOwner}
              onChange={(e) => patchDraft({ showSonivoCredit: e.target.checked })}
            />
            {t('ajustes.showSonivoCredit')}
          </label>

          {isOwner ? (
            <div className="flex items-center gap-3">
              <Button type="button" disabled={savingBrand} onClick={() => void onSaveBranding()}>
                {savingBrand ? t('inicio.working') : t('ajustes.saveBranding')}
              </Button>
              {brandSaved ? (
                <span aria-live="polite" className="text-sm text-slate-600">
                  {t('ajustes.brandingSaved')}
                </span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Legacy device-local appearance: only when server branding is unavailable (flag off). */}
      {!brandingEnabled ? (
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
            <p className="text-sm text-slate-500">{t('ajustes.accentHint')}</p>
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
            <p className="text-sm text-slate-500">{t('ajustes.coverHint')}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.cover')}>
              <button
                type="button"
                aria-pressed={appearance.cover === NO_COVER}
                aria-label={t('ajustes.coverNone')}
                onClick={() => update({ ...appearance, cover: NO_COVER })}
                className={cn(
                  'h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
                  appearance.cover === NO_COVER ? 'border-primary ring-2 ring-primary/25' : 'border-slate-300 hover:border-primary/50',
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
                    appearance.cover === emoji ? 'border-primary ring-2 ring-primary/25' : 'border-slate-300 hover:border-primary/50',
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

          <p className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500">{t('ajustes.logoNote')}</p>

          {saved ? (
            <p aria-live="polite" className="text-sm text-slate-600">
              {t('ajustes.saved')}
            </p>
          ) : null}
        </>
      ) : null}

      {isOwner ? (
        <section
          aria-labelledby="ajustes-danger-heading"
          className="mt-4 space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
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
