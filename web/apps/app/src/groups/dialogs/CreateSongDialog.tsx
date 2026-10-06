import { useState } from 'react'
import { createSong, type SongDetail, type SongOriginKind } from '../../api/client'
import { useT } from '../../i18n'
import { mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import {
  GroupButton,
  GroupDialog,
  GroupInput,
  GroupSelect,
  GroupTextArea,
} from '../ui'

export type CreateSongDialogProps = {
  groupId: string
  onClose: () => void
  onCreated: (song: SongDetail) => void
}

/** Create-song modal (ADR-0074 §5), shared by the Library page and group home. */
export function CreateSongDialog({ groupId, onClose, onCreated }: CreateSongDialogProps) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [originKind, setOriginKind] = useState<SongOriginKind>('original')
  const [attribution, setAttribution] = useState('')
  const [rightsNotes, setRightsNotes] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const originOptions = [
    { value: 'original', label: t('canciones.originOriginal') },
    { value: 'cover', label: t('canciones.originCover') },
    { value: 'other', label: t('canciones.originOther') },
  ]

  async function submit() {
    if (!title.trim()) return
    setPending(true)
    setError(null)
    try {
      const created = await createSong(groupId, {
        title: title.trim(),
        originKind,
        attribution: attribution.trim() || null,
        rightsNotes: rightsNotes.trim() || null,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      notifyGroupDataChanged('songs', groupId)
      onCreated(created)
    } catch (err) {
      setError(mutationErrorMessage(err))
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('canciones.createTitle')}
      pending={pending}
      testId="create-song-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('canciones.cancel')}
          </GroupButton>
          <GroupButton type="submit" disabled={pending || !title.trim()}>
            {pending ? t('canciones.creating') : t('canciones.create')}
          </GroupButton>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}
      <GroupInput
        label={t('canciones.titleLabel')}
        value={title}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setTitle(event.target.value)}
        data-autofocus
      />
      <GroupSelect
        label={t('canciones.originLabel')}
        value={originKind}
        options={originOptions}
        disabled={pending}
        onChange={(value) => setOriginKind(value as SongOriginKind)}
      />
      <GroupInput
        label={t('canciones.attributionLabel')}
        value={attribution}
        maxLength={500}
        disabled={pending}
        onChange={(event) => setAttribution(event.target.value)}
      />
      <GroupInput
        label={t('canciones.tagsLabel')}
        hint={t('canciones.tagsPlaceholder')}
        value={tags}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setTags(event.target.value)}
      />
      <GroupTextArea
        label={t('canciones.rightsLabel')}
        rows={3}
        value={rightsNotes}
        maxLength={2000}
        disabled={pending}
        onChange={(event) => setRightsNotes(event.target.value)}
      />
    </GroupDialog>
  )
}
