import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  deleteGroup,
  getGroup,
  problemDetail,
  updateGroup,
  type CurrentUser,
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

/** Visible/accessible gradient names, translated while the storage id stays English. */
const GRADIENT_NAME_KEYS: Record<string, I18nKey> = {
  violet: 'ajustes.coverGradientViolet',
  ocean: 'ajustes.coverGradientOcean',
  forest: 'ajustes.coverGradientForest',
  sunset: 'ajustes.coverGradientSunset',
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setSaved(false)
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

  function update(next: GroupAppearance) {
    if (!groupId || !isOwnerRole(group?.role)) return
    setAppearance(next)
    writeGroupAppearance(groupId, next)
    setSaved(true)
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
        <p role="alert" className="text-error">
          {error}
        </p>
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          {t('workspace.myGroups')}
        </Link>
      </div>
    )
  }

  const isOwner = isOwnerRole(group.role)

  return (
    <section className="max-w-xl space-y-8" aria-labelledby="ajustes-heading">
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
                appearance.accent === swatch
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'ring-1 ring-slate-300 hover:scale-105',
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
              appearance.cover === NO_COVER
                ? 'border-primary ring-2 ring-primary/25'
                : 'border-slate-300 hover:border-primary/50',
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
                appearance.cover === emoji
                  ? 'border-primary ring-2 ring-primary/25'
                  : 'border-slate-300 hover:border-primary/50',
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
                appearance.cover === `gradient:${id}`
                  ? 'border-primary ring-2 ring-primary/25'
                  : 'border-transparent hover:opacity-90',
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

      {isOwner ? (
        <section
          aria-labelledby="ajustes-danger-heading"
          className="mt-4 space-y-3 rounded-2xl border border-error/40 bg-error/5 p-5"
        >
          <h2 id="ajustes-danger-heading" className="text-lg font-semibold text-error">
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
            <p>
              {t('inicio.deleteBody')}
            </p>
          </ConfirmDialog>
        </section>
      ) : null}
    </section>
  )
}
