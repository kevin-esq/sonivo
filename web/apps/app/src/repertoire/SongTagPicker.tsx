'use client'

import { useEffect, useState } from 'react'
import { getGroupSongTags } from '../api/groups'
import { useT } from '../i18n'

export function SongTagPicker({
  groupId,
  value,
  onChange,
  disabled = false,
}: {
  groupId: string
  value: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}) {
  const { t } = useT()
  const [options, setOptions] = useState<string[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  useEffect(() => {
    let cancelled = false
    void getGroupSongTags(groupId).then((result) => {
      if (cancelled) return
      setOptions(result.tags)
      setLoadState('loaded')
    }).catch(() => {
      if (cancelled) return
      setOptions([])
      setLoadState('error')
    })
    return () => { cancelled = true }
  }, [groupId])

  function toggle(tag: string, checked: boolean) {
    onChange(checked ? [...value, tag] : value.filter((item) => item !== tag))
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-ink">{t('songCreate.tagsLabel')}</legend>
      <p className="text-xs text-muted">{t('songCreate.tagsSelectHint')}</p>
      {loadState === 'loading' ? <p className="text-sm text-muted">{t('songCreate.tagsLoading')}</p> : null}
      {loadState === 'error' ? <p className="text-sm text-error-ink" role="alert">{t('common.errorUnavailable')}</p> : null}
      {loadState === 'loaded' && options.length ? (
        <div className="flex flex-wrap gap-2">
          {options.map((tag) => {
            const checked = value.includes(tag)
            const atLimit = value.length >= 12 && !checked
            return (
              <label key={tag} className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-border-subtle px-3 text-sm ${checked ? 'bg-primary/10 text-primary-ink' : 'bg-surface text-ink'} ${atLimit ? 'opacity-50' : ''}`}>
                <input type="checkbox" checked={checked} disabled={atLimit} onChange={(event) => toggle(tag, event.target.checked)} />
                {tag}
              </label>
            )
          })}
        </div>
      ) : null}
      {loadState === 'loaded' && !options.length ? <p className="text-sm text-muted">{t('songCreate.tagsNoOptions')}</p> : null}
    </fieldset>
  )
}
