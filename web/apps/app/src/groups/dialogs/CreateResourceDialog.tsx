import { useEffect, useState } from 'react'
import {
  createFileResource,
  createLinkResource,
  getGroup,
  listArrangements,
  listSongs,
  type ResourcePurpose,
  type SongListItem,
  type ArrangementListItem,
} from '../../api/client'
import { useT } from '../../i18n'
import { fileUploadErrorMessage } from '../../repertoire/fileUploadErrors'
import { safeExternalResourceUrl } from '../../repertoire/resourceUrl'
import { formatPurpose, mutationErrorMessage } from '../../repertoire/ui'
import { notifyGroupDataChanged } from '../../shell/groupEvents'
import { cn } from '../../ui/cn'
import { FileDropzone } from '../../ui/FileDropzone'
import { resourceUploadLimit } from '../../repertoire/fileUploadErrors'
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
  const [planId, setPlanId] = useState('starter')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let cancelled = false
    getGroup(groupId)
      .then((group) => {
        if (!cancelled) setPlanId(group.planId)
      })
      .catch(() => undefined)
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
      setError(t('resources.fieldArrangement'))
      return
    }
    if (mode === 'link' && !safeExternalResourceUrl(url)) {
      setError(t('resources.urlInvalid'))
      return
    }
    setPending(true)
    try {
      if (mode === 'file') {
        if (!file) {
          setError(t('resources.fileRequired'))
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
      setError(mode === 'file' ? fileUploadErrorMessage(err, t) : mutationErrorMessage(err, t))
      setPending(false)
    }
  }

  return (
    <GroupDialog
      open
      onClose={onClose}
      title={t('resources.modalTitle')}
      pending={pending}
      testId="create-resource-dialog"
      onSubmit={() => void submit()}
      footer={
        <>
          <GroupButton variant="secondary" onClick={onClose} disabled={pending}>
            {t('resources.cancel')}
          </GroupButton>
          <GroupButton
            type="submit"
            disabled={pending || !label.trim() || !arrangementId}
          >
            {pending ? t('resources.saving') : t('resources.uploadButton')}
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
        aria-label={t('resources.fieldFile')}
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
            {option === 'file' ? t('resources.fileKind') : t('resources.linkKind')}
          </button>
        ))}
      </div>

      <GroupSelect
        label={t('resources.fieldSong')}
        value={songId}
        options={songOptions}
        disabled={pending || songs === null}
        onChange={setSongId}
      />
      <GroupSelect
        label={t('resources.fieldArrangement')}
        value={arrangementId}
        options={arrangementOptions}
        disabled={pending || !songId || arrangements === null}
        onChange={setArrangementId}
      />
      <GroupInput
        label={t('resources.fieldLabel')}
        value={label}
        maxLength={200}
        disabled={pending}
        onChange={(event) => setLabel(event.target.value)}
        data-autofocus
      />
      <GroupSelect
        label={t('resources.fieldCategory')}
        value={purpose}
        options={purposeOptions}
        disabled={pending}
        onChange={(value) => {
          setPurpose(value as ResourcePurpose)
          setFile(null)
        }}
      />
      <GroupTextArea
        label={t('resources.fieldDescription')}
        rows={2}
        value={note}
        maxLength={2000}
        disabled={pending}
        onChange={(event) => setNote(event.target.value)}
      />

      {mode === 'file' ? (
        <FileDropzone
          title={t('resources.fieldFile')}
          description={t('resources.formatsHint')}
          file={file}
          onFileChange={setFile}
          maxSizeBytes={resourceUploadLimit(planId, purpose)}
          disabled={pending}
          testId="resource-file-dropzone"
        />
      ) : (
        <GroupInput
          label={t('resources.fieldUrl')}
          value={url}
          placeholder={t('resources.urlPlaceholder')}
          maxLength={2000}
          hint={t('resources.urlHint')}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={pending}
          onChange={(event) => setUrl(event.target.value)}
        />
      )}
    </GroupDialog>
  )
}
