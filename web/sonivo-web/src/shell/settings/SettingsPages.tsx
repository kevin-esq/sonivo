import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listMyGroups, problemDetail, type GroupSummary } from '../../api/client'

export function SettingsProfilePage({
  user,
}: {
  user: { email?: string | null; displayName?: string | null; id?: string }
}) {
  const sessionName = user?.displayName ?? ''
  const email = user?.email ?? ''

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Perfil Personal</h2>
        <p className="text-sm text-slate-500">Actualiza tus datos personales de contacto y preferencias.</p>
      </div>

      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Nombre completo</span>
          <input
            key={sessionName}
            type="text"
            defaultValue={sessionName}
            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Correo electrónico</span>
          <input
            type="email"
            disabled
            readOnly
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-500 cursor-not-allowed"
            value={email}
          />
        </label>
      </div>
    </div>
  )
}

export function SettingsTeamPage() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result)
      })
      .catch((err) => {
        if (!cancelled) setError(problemDetail(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Miembros del Equipo</h2>
        <p className="text-sm text-slate-500">Gestiona los roles y miembros activos en tus grupos musicales.</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      {groups === null && !error ? (
        <p aria-live="polite" className="text-sm text-slate-500">
          Cargando grupos…
        </p>
      ) : groups && groups.length > 0 ? (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li
              key={group.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3"
            >
              <span className="font-medium text-slate-900 dark:text-white">{group.name}</span>
              <Link
                className="text-sm font-semibold text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to={`/groups/${group.id}/people`}
              >
                Ver miembros
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm">
          Aún no perteneces a ningún grupo. Cuando crees o te unas a uno, podrás gestionar a sus
          miembros desde su página de equipo.
        </div>
      )}
    </div>
  )
}
