import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import {
  createFileResource,
  createLinkResource,
  listArrangements,
  listSongs,
  type ResourcePurpose,
  type SongListItem,
  type ArrangementListItem,
} from '../../api/client'
import { useT } from '../../i18n'
import { formatPurpose, mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { cn } from '../../ui/cn'
import { GroupButton, GroupDialog, GroupInput, GroupSelect, GroupTextArea } from '../ui'

const PURPOSES: ResourcePurpose[] = ['chart', 'lyrics', 'audio', 'reference', 'practice', 'other']

export type CreateResourceDialogProps = {
  groupId: string
  onClose: () => void
  onUploaded: () => void
}

/**
 * Upload/link resource modal (ADR-0074 §5). Resources live on arrangements
 * (ADR-0007/0014), so a song + arrangement are required.
 */
export function CreateResourceDialog({ groupId, onClose, onUploaded }: CreateResourceDialogProps) {
  const { t } = useT()
  const [songs, setSongs] = useState<SongListItem[] | null>(null)
  const [songId, setSongId] = useState('')
  const [arrangements, setArrangements] = useState<ArrangementListItem[] | null>(null)
  const [arrangementId, setArrangementId] = useState('')
  const [label, setLabel] = useState('')
  const [purpose, setPurpose] = useState<ResourcePurpose>('reference')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    listSongs(groupId)
      .then((result) => {
        if (cancelled) return
        setSongs(result)
        if (result[0]) setSongId(result[0].id)
      })
      .catch(() => {
        if (!cancelled) setSongs([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  useEffect(() => {
    if (!songId) {
      setArrangements(null)
      setArrangementId('')
      return
    }
    let cancelled = false
    setArrangements(null)
    setArrangementId('')
    listArrangements(groupId, songId)
      .then((result) => {
        if (cancelled) return
        setArrangements(result)
        if (result[0]) setArrangementId(result[0].id)
      })
      .catch(() => {
        if (!cancelled) setArrangements([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId, songId])

  const songOptions = (songs ?? []).map((song) => ({ value: song.id, label: song.title }))
  const arrangementOptions = (arrangements ?? []).map((arrangement) => ({
    value: arrangement.id,
    label: arrangement.label,
  }))
  const purposeOptions = PURPOSES.map((value) => ({ value, label: formatPurpose(value, t) }))

  async function submit() {
    setError(null)
    if (!arrangementId) {
      setError(t('recursos.fieldArrangement'))
      return
    }
    setPending(true)
    try {
      if (mode === 'file') {
        if (!file) {
          setError(t('recursos.fileRequired'))
          setPending(false)
          return
        }
        await createFileResource(groupId, arrangementId, {
          purpose,
          label: label.trim(),
          file,
          note: note.trim() || null,
        })
      } else {
        await createLinkResource(groupId, arrangementId, {
          purpose,
          label: label.trim(),
          url: url.trim(),
          note: note.trim() || null,
        })
      }
      notifyGroupDataChanged('resources', groupId)
      onUploaded()
    } catch (err) {
      setError(mutationErrorMessage(err))
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('recursos.modalTitle')}
      pending={pending}
      testId="create-resource-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('recursos.cancel')}
          </GroupButton>
          <GroupButton
            type="submit"
            disabled={pending || !label.trim() || !arrangementId}
          >
            {pending ? t('recursos.saving') : t('recursos.uploadButton')}
          </GroupButton>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-error-ink">
          {error}
        </p>
      ) : null}

      <div
        role="tablist"
        aria-label={t('recursos.fieldFile')}
        className="inline-flex rounded-xl border border-border-subtle bg-surface-hover p-0.5"
      >
        {(['file', 'link'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            disabled={pending}
            onClick={() => setMode(option)}
            className={cn(
              'min-h-9 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none',
              mode === option
                ? 'bg-primary-strong text-primary-foreground'
                : 'text-muted hover:text-ink',
            )}
          >
            {option === 'file' ? t('recursos.fileKind') : t('recursos.linkKind')}
          </button>
        ))}
      </div>

      <GroupSelect
        label={t('recursos.fieldSong')}
        value={songId}
        options={songOptions}
        disabled={pending || songs === null}
        onChange={setSongId}
      />
      <GroupSelect
        label={t('recursos.fieldArrangement')}
        value={arrangementId}
        options={arrangementOptions}
        disabled={pending || !songId || arrangements === null}
        onChange={setArrangementId}
      />
      <GroupInput
        label={t('recursos.fieldLabel')}
        value={label}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setLabel(event.target.value)}
        data-autofocus
      />
      <GroupSelect
        label={t('recursos.fieldCategory')}
        value={purpose}
        options={purposeOptions}
        disabled={pending}
        onChange={(value) => setPurpose(value as ResourcePurpose)}
      />
      <GroupTextArea
        label={t('recursos.fieldDescription')}
        rows={2}
        value={note}
        maxLength={2000}
        disabled={pending}
        onChange={(event) => setNote(event.target.value)}
      />

      {mode === 'file' ? (
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-subtle bg-surface-hover/50 px-4 py-3 text-center text-sm text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
          <Upload className="h-5 w-5" aria-hidden="true" />
          <span className="font-medium text-ink">{t('recursos.fieldFile')}</span>
          <span>{file ? file.name : t('recursos.dropHint')}</span>
          <span className="text-xs">{t('recursos.formatsHint')}</span>
          <input
            type="file"
            className="sr-only"
            disabled={pending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <GroupInput
          label={t('recursos.fieldFile')}
          value={url}
          placeholder="https://"
          disabled={pending}
          onChange={(event) => setUrl(event.target.value)}
        />
      )}
    </GroupDialog>
  )
}
