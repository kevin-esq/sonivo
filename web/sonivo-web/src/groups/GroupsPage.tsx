import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Users } from 'lucide-react'
import { createGroup, listMyGroups, problemDetail, type CurrentUser, type GroupSummary } from '../api/client'
import { useT } from '../i18n'
import { formatMembershipRole } from '../repertoire/ui'
import { Button } from '../ui/button'
import { fieldClass } from '../ui/field'
import { ListSkeleton } from '../ui/skeleton'

export function GroupsPage({ user }: { user: CurrentUser }) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const { t } = useT()

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
    <section className="space-y-8" aria-labelledby="groups-heading">
      <header className="space-y-1.5">
        <h1 id="groups-heading" className="text-3xl font-bold tracking-tight text-ink">
          {t('grupos.title')}
        </h1>
        <p className="max-w-lg text-sm text-muted">{t('grupos.subtitle')}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {groups === null ? (
        <ListSkeleton rows={3} label={t('grupos.loading')} />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-slate-300 bg-neutral-light/60 px-5 py-8">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary"
            aria-hidden="true"
          >
            <Users className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-neutral-dark">{t('grupos.emptyTitle')}</p>
            <p className="max-w-md text-sm text-slate-500">{t('grupos.empty')}</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2" aria-label={t('grupos.listLabel')}>
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                to={`/groups/${group.id}`}
                aria-label={group.name}
                aria-describedby={`group-role-${group.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 no-underline transition duration-150 hover:border-primary/40 hover:bg-neutral-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 font-semibold text-primary"
                  aria-hidden="true"
                >
                  {group.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-neutral-dark group-hover:text-primary">
                    {group.name}
                  </span>
                  <span id={`group-role-${group.id}`} className="mt-0.5 block text-sm text-slate-500">
                    ({formatMembershipRole(group.role)})
                  </span>
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-slate-400 transition duration-150 group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 md:p-6"
        onSubmit={onCreate}
      >
        <h2 className="text-lg font-semibold text-neutral-dark">{t('grupos.createTitle')}</h2>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">{t('grupos.nameLabel')}</span>
          <input
            className={fieldClass}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <Button type="submit" disabled={creating}>
          {creating ? t('grupos.creating') : t('grupos.create')}
        </Button>
      </form>
    </section>
  )
}
