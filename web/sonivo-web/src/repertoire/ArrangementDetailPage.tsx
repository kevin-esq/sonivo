import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createFileResource,
  createLinkResource,
  deleteArrangement,
  deleteResource,
  getArrangement,
  getSong,
  isConflictError,
  resourceContentUrl,
  updateArrangement,
  updateLinkResource,
  type ArrangementDetail,
  type CurrentUser,
  type ResourcePurpose,
  type ResourceSummary,
} from '../api/client'
import { Button, buttonVariants } from '../ui/button'
import { fieldClass } from '../ui/field'
import {
  EmptyPanel,
  Field,
  FormActions,
  PageBreadcrumb,
  PurposeHeading,
  RESOURCE_PURPOSE_ORDER,
  groupResourcesByPurpose,
} from './chrome'
import { ChordProView } from './ChordProView'
import { looksLikeChordPro } from './chordPro'
import {
  CONFLICT_MESSAGE,
  ConfirmDialog,
  ConflictAlert,
  formatPurpose,
  isOwnerRole,
  mutationErrorMessage,
  ProblemAlert,
  useGroupContext,
} from './ui'

export function ArrangementDetailPage({ user }: { user: CurrentUser }) {
  const { groupId, arrangementId } = useParams()
  const navigate = useNavigate()
  const { group, error: groupError } = useGroupContext(groupId, user.id)
  const [arrangement, setArrangement] = useState<ArrangementDetail | null | undefined>(undefined)
  const [songTitle, setSongTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creatingResource, setCreatingResource] = useState(false)
  const [creatingFileResource, setCreatingFileResource] = useState(false)
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [confirmDeleteArrangement, setConfirmDeleteArrangement] = useState(false)
  const [deletingArrangement, setDeletingArrangement] = useState(false)
  const [resourceToDelete, setResourceToDelete] = useState<ResourceSummary | null>(null)
  const [deletingResource, setDeletingResource] = useState(false)

  const isOwner = isOwnerRole(group?.role)

  async function reloadArrangement() {
    if (!groupId || !arrangementId) return
    const result = await getArrangement(groupId, arrangementId)
    setArrangement(result)
    try {
      const song = await getSong(groupId, result.songId)
      setSongTitle(song.title)
    } catch {
      setSongTitle(null)
    }
  }

  useEffect(() => {
    if (!groupId || !arrangementId || !group) return
    let cancelled = false
    async function load() {
      setArrangement(undefined)
      setSongTitle(null)
      setError(null)
      setConflict(null)
      try {
        const result = await getArrangement(groupId!, arrangementId!)
        if (cancelled) return
        setArrangement(result)
        try {
          const song = await getSong(groupId!, result.songId)
          if (!cancelled) setSongTitle(song.title)
        } catch {
          if (!cancelled) setSongTitle(null)
        }
      } catch (err) {
        if (cancelled) return
        setArrangement(null)
        setError(mutationErrorMessage(err))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, arrangementId, group])

  async function handleDeleteArrangement() {
    if (!groupId || !arrangementId || !arrangement) return
    setDeletingArrangement(true)
    setError(null)
    setConflict(null)
    try {
      await deleteArrangement(groupId, arrangementId, arrangement.version)
      setConfirmDeleteArrangement(false)
      navigate(`/groups/${groupId}/songs/${arrangement.songId}`)
    } catch (err) {
      if (isConflictError(err)) {
        setConflict(CONFLICT_MESSAGE)
        setConfirmDeleteArrangement(false)
        try {
          await reloadArrangement()
        } catch (reloadErr) {
          setError(mutationErrorMessage(reloadErr))
        }
      } else {
        setError(mutationErrorMessage(err))
        setConfirmDeleteArrangement(false)
      }
    } finally {
      setDeletingArrangement(false)
    }
  }

  async function handleDeleteResource() {
    if (!groupId || !arrangementId || !resourceToDelete) return
    setDeletingResource(true)
    setError(null)
    try {
      await deleteResource(groupId, arrangementId, resourceToDelete.id)
      setResourceToDelete(null)
      await reloadArrangement()
    } catch (err) {
      setError(mutationErrorMessage(err))
      setResourceToDelete(null)
    } finally {
      setDeletingResource(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Cargando arreglo…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={groupError} />
        <Link className="font-semibold text-primary no-underline hover:underline" to="/">
          Mis grupos
        </Link>
      </div>
    )
  }

  if (arrangement === undefined) {
    return <p aria-live="polite">Cargando arreglo…</p>
  }

  if (arrangement === null) {
    return (
      <div className="space-y-3">
        <ProblemAlert message={error ?? 'No se encontró el arreglo o no tienes acceso.'} />
        <Link
          className="font-semibold text-primary no-underline hover:underline"
          to={`/groups/${group.id}/library`}
        >
          Biblioteca
        </Link>
      </div>
    )
  }

  const grouped = groupResourcesByPurpose(arrangement.resources)
  const showAddResource = isOwner && !creatingResource && !creatingFileResource
  const songHref = `/groups/${group.id}/songs/${arrangement.songId}`

  return (
    <section className="space-y-6" aria-labelledby="arrangement-heading">
      <div className="space-y-3">
        <PageBreadcrumb
          items={[
            { to: `/groups/${group.id}`, label: group.name },
            { to: `/groups/${group.id}/library`, label: 'Biblioteca' },
            { to: songHref, label: songTitle ?? 'Canción' },
            { label: arrangement.label },
          ]}
        />
        <div className="space-y-2">
          <h1 id="arrangement-heading" className="text-2xl font-bold tracking-tight">
            {arrangement.label}
          </h1>
          <p className="text-sm text-slate-500">
            Arreglo de {songTitle ? <Link className="font-medium text-primary no-underline hover:underline" to={songHref}>{songTitle}</Link> : 'esta canción'}
            {arrangement.defaultKey ? ` · ${arrangement.defaultKey}` : ''}
            {arrangement.defaultBpm != null ? ` · ${arrangement.defaultBpm} BPM` : ''}
            {!isOwner ? ' · Solo lectura' : ''}
          </p>
          <div className="pt-1">
            <Link
              className={buttonVariants({ variant: 'primary' })}
              to={`/groups/${group.id}/arrangements/${arrangement.id}/practice`}
            >
              Practicar
            </Link>
          </div>
        </div>
      </div>

      <ProblemAlert message={error} />
      <ConflictAlert message={conflict} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="space-y-4" aria-labelledby="resources-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="resources-heading" className="text-lg font-semibold">
              Recursos
            </h2>
            {showAddResource && arrangement.resources.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCreatingResource(true)}>Agregar enlace</Button>
                <Button variant="secondary" onClick={() => setCreatingFileResource(true)}>
                  Subir archivo
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">
            Materiales de este arreglo, agrupados por propósito. Puedes enlazar o subir un archivo
            pequeño (hasta 5&nbsp;MiB).
          </p>

          {arrangement.resources.length === 0 && !creatingResource && !creatingFileResource ? (
            <EmptyPanel
              title="Aún no hay materiales"
              description="Enlaza o sube partituras, letra, audio, click u otro material de ensayo para este arreglo."
              action={
                showAddResource ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setCreatingResource(true)}>Agregar enlace</Button>
                    <Button variant="secondary" onClick={() => setCreatingFileResource(true)}>
                      Subir archivo
                    </Button>
                  </div>
                ) : null
              }
            />
          ) : (
            <div className="space-y-6">
              {grouped.map((groupItem) => (
                <section key={groupItem.purpose} className="space-y-2" aria-label={formatPurpose(groupItem.purpose)}>
                  <PurposeHeading purpose={groupItem.purpose} />
                  <ul className="divide-y divide-slate-100">
                    {groupItem.resources.map((resource) => (
                      <li key={resource.id} className="py-3">
                        {editingResourceId === resource.id && isOwner ? (
                          <ResourceEditForm
                            groupId={group.id}
                            arrangementId={arrangement.id}
                            resource={resource}
                            onCancel={() => setEditingResourceId(null)}
                            onSaved={async () => {
                              setEditingResourceId(null)
                              await reloadArrangement()
                            }}
                          />
                        ) : (
                          <ResourceRow
                            groupId={group.id}
                            arrangementId={arrangement.id}
                            resource={resource}
                            isOwner={isOwner}
                            onEdit={() => setEditingResourceId(resource.id)}
                            onDelete={() => setResourceToDelete(resource)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {isOwner && creatingResource ? (
            <ResourceCreateForm
              groupId={group.id}
              arrangementId={arrangement.id}
              onCancel={() => setCreatingResource(false)}
              onCreated={async () => {
                setCreatingResource(false)
                await reloadArrangement()
              }}
            />
          ) : null}

          {isOwner && creatingFileResource ? (
            <FileResourceCreateForm
              groupId={group.id}
              arrangementId={arrangement.id}
              onCancel={() => setCreatingFileResource(false)}
              onCreated={async () => {
                setCreatingFileResource(false)
                await reloadArrangement()
              }}
            />
          ) : null}
        </section>

        <aside className="space-y-4 rounded-2xl bg-neutral-light p-5">
          {editing && isOwner ? (
            <ArrangementEditForm
              arrangement={arrangement}
              groupId={group.id}
              onCancel={() => setEditing(false)}
              onSaved={async (next) => {
                setArrangement(next)
                setEditing(false)
                setConflict(null)
              }}
              onConflict={async () => {
                setConflict(CONFLICT_MESSAGE)
                setEditing(false)
                try {
                  await reloadArrangement()
                } catch (err) {
                  setError(mutationErrorMessage(err))
                }
              }}
            />
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Tonalidad</dt>
                <dd className="font-medium">{arrangement.defaultKey ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tempo</dt>
                <dd className="font-medium">{arrangement.defaultBpm ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Letra</dt>
                <dd className="whitespace-pre-wrap font-medium">{arrangement.lyrics ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Acordes (ChordPro)</dt>
                <dd className="whitespace-pre-wrap font-medium">{arrangement.chords ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Estructura</dt>
                <dd className="whitespace-pre-wrap font-medium">{arrangement.structure ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Notas</dt>
                <dd className="whitespace-pre-wrap font-medium">{arrangement.notes ?? '—'}</dd>
              </div>
            </dl>
          )}

          {isOwner && !editing ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Editar arreglo
              </Button>
              <Button variant="danger" onClick={() => setConfirmDeleteArrangement(true)}>
                Eliminar arreglo
              </Button>
            </div>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDeleteArrangement}
        title="¿Eliminar arreglo?"
        confirmLabel="Eliminar arreglo"
        cancelLabel="Cancelar"
        pendingLabel="Eliminando…"
        pending={deletingArrangement}
        onCancel={() => setConfirmDeleteArrangement(false)}
        onConfirm={() => void handleDeleteArrangement()}
      >
        <p>
          Esto oculta el arreglo de las vistas activas. Los enlaces se conservan en el
          servidor.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={resourceToDelete != null}
        title="¿Eliminar recurso?"
        confirmLabel="Eliminar recurso"
        cancelLabel="Cancelar"
        pendingLabel="Eliminando…"
        pending={deletingResource}
        onCancel={() => setResourceToDelete(null)}
        onConfirm={() => void handleDeleteResource()}
      >
        <p>
          Esto elimina de forma permanente el recurso
          {resourceToDelete ? ` “${resourceToDelete.label}”` : ''}. No se puede deshacer.
        </p>
      </ConfirmDialog>
    </section>
  )
}

function ResourceRow({
  groupId,
  arrangementId,
  resource,
  isOwner,
  onEdit,
  onDelete,
}: {
  groupId: string
  arrangementId: string
  resource: ResourceSummary
  isOwner: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const isFile = resource.kind === 'file'
  const downloadHref = isFile
    ? resourceContentUrl(groupId, arrangementId, resource.id)
    : null

  return (
    <div className="space-y-2">
      <p className="font-semibold text-neutral-dark">{resource.label}</p>
      {resource.part ? <p className="text-sm text-slate-500">Parte: {resource.part}</p> : null}
      {resource.note ? <p className="text-sm text-slate-600">{resource.note}</p> : null}
      {resource.url ? (
        <p>
          <a
            className="break-all font-medium text-primary no-underline hover:underline"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      {isFile && downloadHref ? (
        <p className="text-sm text-slate-500">
          {resource.originalFileName ?? 'Archivo'}
          {resource.byteSize != null ? ` · ${formatByteSize(resource.byteSize)}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {downloadHref ? (
          <a className={buttonVariants({ variant: 'primary', size: 'sm' })} href={downloadHref}>
            Descargar
          </a>
        ) : null}
        {isOwner ? (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete}>
              Eliminar
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function ArrangementEditForm({
  arrangement,
  groupId,
  onCancel,
  onSaved,
  onConflict,
}: {
  arrangement: ArrangementDetail
  groupId: string
  onCancel: () => void
  onSaved: (arrangement: ArrangementDetail) => Promise<void>
  onConflict: () => Promise<void>
}) {
  const [label, setLabel] = useState(arrangement.label)
  const [defaultKey, setDefaultKey] = useState(arrangement.defaultKey ?? '')
  const [defaultBpm, setDefaultBpm] = useState(
    arrangement.defaultBpm != null ? String(arrangement.defaultBpm) : '',
  )
  const [lyrics, setLyrics] = useState(arrangement.lyrics ?? '')
  const [chords, setChords] = useState(arrangement.chords ?? '')
  const [structure, setStructure] = useState(arrangement.structure ?? '')
  const [notes, setNotes] = useState(arrangement.notes ?? '')
  const [importError, setImportError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function onImportChordPro(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setImportError('No se pudo leer el archivo.')
        return
      }
      setChords(reader.result)
    }
    reader.onerror = () => {
      setImportError('No se pudo leer el archivo.')
    }
    reader.readAsText(file)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const payload: Parameters<typeof updateArrangement>[2] = {
      expectedVersion: arrangement.version,
      label: label.trim(),
      defaultKey,
      lyrics,
      chords,
      structure,
      notes,
    }

    if (defaultBpm.trim()) {
      const parsed = Number(defaultBpm)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 400) {
        setError('El tempo (BPM) debe ser un entero entre 1 y 400.')
        setPending(false)
        return
      }
      payload.defaultBpm = parsed
    }

    try {
      const updated = await updateArrangement(groupId, arrangement.id, payload)
      await onSaved(updated)
    } catch (err) {
      if (isConflictError(err)) {
        await onConflict()
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">Editar arreglo</h3>
      <ProblemAlert message={error} />
      <Field label="Etiqueta">
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Tonalidad (opcional)" hint="Vacía el campo para quitar la tonalidad.">
        <input
          className={fieldClass}
          value={defaultKey}
          onChange={(e) => setDefaultKey(e.target.value)}
          maxLength={32}
        />
      </Field>
      <Field
        label="Tempo / BPM (opcional, 1–400)"
        hint="Déjalo en blanco para conservar el tempo actual."
      >
        <input
          className={fieldClass}
          type="number"
          min={1}
          max={400}
          inputMode="numeric"
          value={defaultBpm}
          onChange={(e) => setDefaultBpm(e.target.value)}
        />
      </Field>
      <Field label="Letra (opcional)">
        <textarea className={fieldClass} rows={3} value={lyrics} onChange={(e) => setLyrics(e.target.value)} />
      </Field>
      <div className="space-y-1.5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Acordes (ChordPro)</span>
          <textarea
            className={fieldClass}
            rows={5}
            value={chords}
            onChange={(e) => setChords(e.target.value)}
            data-testid="arrangement-chords"
            spellCheck={false}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Importar archivo (.cho, .chordpro, .txt)
          </span>
          <input
            className={fieldClass}
            type="file"
            accept=".cho,.chordpro,.txt,text/plain"
            onChange={onImportChordPro}
            data-testid="arrangement-chords-import"
          />
        </label>
        {importError ? <p className="text-sm text-red-600">{importError}</p> : null}
        {chords.trim() ? (
          <div className="space-y-2 pt-1">
            <p className="text-sm font-medium text-slate-700">Vista previa</p>
            {looksLikeChordPro(chords) ? (
              <ChordProView
                text={chords}
                testId="chords-preview"
                className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-white p-3 font-sans ring-1 ring-slate-200"
              />
            ) : (
              <pre
                className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-sm ring-1 ring-slate-200"
                data-testid="chords-preview"
              >
                {chords}
              </pre>
            )}
          </div>
        ) : null}
      </div>
      <Field label="Estructura (opcional)">
        <textarea
          className={fieldClass}
          rows={2}
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
        />
      </Field>
      <Field label="Notas (opcional)">
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}

function ResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await createLinkResource(groupId, arrangementId, {
        purpose,
        label: label.trim(),
        url: url.trim(),
        part: part.trim() || null,
        note: note.trim() || null,
      })
      await onCreated()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">Agregar enlace</h3>
      <ProblemAlert message={error} />
      <Field label="Propósito">
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Etiqueta">
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="URL">
        <input
          className={fieldClass}
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
        />
      </Field>
      <Field label="Parte (opcional)">
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Nota (opcional)">
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Creando…' : 'Crear enlace'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}

function FileResourceCreateForm({
  groupId,
  arrangementId,
  onCreated,
  onCancel,
}: {
  groupId: string
  arrangementId: string
  onCreated: () => Promise<void>
  onCancel: () => void
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>('practice')
  const [label, setLabel] = useState('')
  const [part, setPart] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      setError('Selecciona un archivo.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await createFileResource(groupId, arrangementId, {
        purpose,
        label: label.trim(),
        file,
        part: part.trim() || null,
        note: note.trim() || null,
      })
      await onCreated()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={onSubmit} noValidate>
      <h3 className="font-semibold">Subir archivo</h3>
      <ProblemAlert message={error} />
      <Field label="Propósito">
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Etiqueta">
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field
        label="Archivo"
        hint="PDF, imagen, audio o texto plano. Máximo 5 MiB."
      >
        <input
          className={fieldClass}
          type="file"
          required
          accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.txt,application/pdf,image/png,image/jpeg,image/webp,audio/mpeg,audio/wav,audio/mp4,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <Field label="Parte (opcional)">
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Nota (opcional)">
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Subiendo…' : 'Subir archivo'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}

function ResourceEditForm({
  groupId,
  arrangementId,
  resource,
  onCancel,
  onSaved,
}: {
  groupId: string
  arrangementId: string
  resource: ResourceSummary
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [purpose, setPurpose] = useState<ResourcePurpose>(
    (RESOURCE_PURPOSE_ORDER.includes(resource.purpose as ResourcePurpose)
      ? resource.purpose
      : 'other') as ResourcePurpose,
  )
  const [label, setLabel] = useState(resource.label)
  const [part, setPart] = useState(resource.part ?? '')
  const [note, setNote] = useState(resource.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      await updateLinkResource(groupId, arrangementId, resource.id, {
        purpose,
        label: label.trim(),
        part,
        note,
      })
      await onSaved()
    } catch (err) {
      setError(mutationErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <h4 className="font-semibold">Editar datos del recurso</h4>
      {resource.url ? (
        <p className="text-sm text-slate-500">
          URL (no se puede cambiar):{' '}
          <a
            className="break-all font-medium text-primary no-underline hover:underline"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.url}
          </a>
        </p>
      ) : null}
      {resource.kind === 'file' && resource.originalFileName ? (
        <p className="text-sm text-slate-500">
          Archivo (no se puede cambiar): {resource.originalFileName}
        </p>
      ) : null}
      <ProblemAlert message={error} />
      <Field label="Propósito">
        <select
          className={fieldClass}
          required
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ResourcePurpose)}
        >
          {RESOURCE_PURPOSE_ORDER.map((value) => (
            <option key={value} value={value}>
              {formatPurpose(value)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Etiqueta">
        <input
          className={fieldClass}
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
        />
      </Field>
      <Field label="Parte (opcional)" hint="Vacía el campo para quitar la parte.">
        <input className={fieldClass} value={part} onChange={(e) => setPart(e.target.value)} maxLength={100} />
      </Field>
      <Field label="Nota (opcional)" hint="Vacía el campo para quitar la nota.">
        <textarea className={fieldClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
      </FormActions>
    </form>
  )
}
