import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, getGroup, problemDetail, type CurrentUser, type GroupDetail } from '../api/client'
import { useT } from '../i18n'
import { ACCESS_DENIED_MESSAGE, isOwnerRole } from '../repertoire/ui'
import { cn } from '../ui/cn'
import { fieldClass } from '../ui/field'
import {
  GROUP_ACCENT_PRESETS,
  GROUP_COVER_EMOJIS,
  GROUP_COVER_GRADIENTS,
  groupCoverStyle,
  isGradientCover,
  readGroupAppearance,
  writeGroupAppearance,
  type GroupAppearance,
} from './groupAccent'

export function GroupSettingsPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const { t } = useT()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<GroupAppearance>(() => readGroupAppearance(groupId))
  const [saved, setSaved] = useState(false)

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
        if (!cancelled) setGroup(result)
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

      <div
        className="overflow-hidden rounded-2xl"
        role="img"
        aria-label={t('grupo.coverArt')}
        style={groupCoverStyle(appearance.cover, appearance.accent)}
      >
        <div className="flex items-center gap-4 px-5 py-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-black/25 text-3xl font-semibold" aria-hidden="true">
            {isGradientCover(appearance.cover) ? group.name.slice(0, 1).toUpperCase() : appearance.cover}
          </span>
          <p className="truncate text-2xl font-semibold tracking-tight text-white">{group.name}</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('ajustes.name')}</span>
          <input className={fieldClass} type="text" value={group.name} disabled readOnly aria-readonly="true" />
        </label>
        <p className="text-sm text-slate-500">{t('ajustes.nameReadonly')}</p>
      </div>

      <fieldset className="space-y-3" disabled={!isOwner}>
        <legend className="font-medium">{t('ajustes.accent')}</legend>
        <p className="text-sm text-slate-500">{t('ajustes.accentHint')}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ajustes.accent')}>
          {GROUP_ACCENT_PRESETS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={appearance.accent === swatch}
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
          {GROUP_COVER_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={emoji}
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
              {id}
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
    </section>
  )
}
