'use client'

import { useEffect, useState } from 'react'
import { getGroupSongTags, updateGroupSongTags } from '../../../api/groups'
import { useT } from '../../../i18n'
import { Button } from '../../../ui/button'
import { fieldClass } from '../../../ui/field'
import { mutationErrorMessage, ProblemAlert } from '../../../repertoire/ui'

export function GroupSongTagsPanel({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const { t } = useT()
  const [version, setVersion] = useState(0)
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getGroupSongTags(groupId).then((result) => {
      if (cancelled) return
      setVersion(result.version)
      setTags(result.tags)
      setDraft(result.tags.join('\n'))
    }).catch(() => {
      if (!cancelled) setError(t('common.errorUnavailable'))
    })
    return () => { cancelled = true }
  }, [groupId, t])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const result = await updateGroupSongTags(groupId, {
        expectedVersion: version,
        tags: draft.split('\n').map((tag) => tag.trim()).filter(Boolean),
      })
      setVersion(result.version)
      setTags(result.tags)
      setDraft(result.tags.join('\n'))
    } catch (cause) {
      setError(mutationErrorMessage(cause, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5" aria-labelledby="song-tags-settings-title">
      <div className="space-y-1">
        <h2 id="song-tags-settings-title" className="text-lg font-semibold">{t('settings.songTagsTitle')}</h2>
        <p className="text-sm text-muted">{t('settings.songTagsHint')}</p>
      </div>
      <ProblemAlert message={error} />
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-ink">{t('settings.songTagsLabel')}</span>
        <textarea className={fieldClass} rows={5} value={draft} disabled={!isOwner || saving} maxLength={1700} onChange={(event) => setDraft(event.target.value)} />
      </label>
      {tags.length ? <p className="text-xs text-muted">{t('settings.songTagsCurrent', { count: tags.length })}</p> : null}
      {isOwner ? <Button type="button" disabled={saving || draft === tags.join('\n')} onClick={() => void save()}>{saving ? t('settings.saving') : t('common.save')}</Button> : null}
    </section>
  )
}
