import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createGroup, listMyGroups, problemDetail, type CurrentUser, type GroupSummary } from '../api/client'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'

export function GroupsPage({ user }: { user: CurrentUser }) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  async function reload() {
    setError(null)
    try {
      setGroups(await listMyGroups())
    } catch (err) {
      setError(problemDetail(err))
      setGroups([])
    }
  }

  useEffect(() => {
    void reload()
  }, [user.id])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const created = await createGroup(name)
      setName('')
      navigate(`/groups/${created.id}`)
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="groups-heading">
      <div>
        <h1 id="groups-heading" className="text-2xl font-bold tracking-tight">
          Mis grupos
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Crea y elige un grupo musical. Abre un grupo para preparar setlists y eventos.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-error">
          {error}
        </p>
      ) : null}

      {groups === null ? (
        <p aria-live="polite">Cargando grupos…</p>
      ) : groups.length === 0 ? (
        <p>Aún no tienes grupos. Crea uno para empezar.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <Link
                className="font-semibold text-neutral-dark no-underline hover:text-primary"
                to={`/groups/${group.id}`}
              >
                {group.name}
              </Link>
              <span className="text-sm text-slate-500">({group.role})</span>
            </li>
          ))}
        </ul>
      )}

      <form className="space-y-3 border-t border-slate-200 pt-6" onSubmit={onCreate}>
        <h2 className="font-semibold">Crear grupo</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Nombre</span>
          <input
            className={fieldClass}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <Button type="submit" disabled={creating}>
          {creating ? 'Creando…' : 'Crear grupo'}
        </Button>
      </form>
    </section>
  )
}
