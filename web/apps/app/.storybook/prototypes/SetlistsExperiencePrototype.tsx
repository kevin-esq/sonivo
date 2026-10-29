import { useMemo, useState } from 'react'
import { ArrowRight, Check, ListMusic, Plus, Search, SlidersHorizontal, Star } from 'lucide-react'
import { GroupButton, GroupPageHeader } from '../../src/groups/ui'
import { GroupShellProvider } from '../../src/shell/GroupShellContext'

type Setlist = { id: string; name: string; count: number; updated: string; color: string; starred?: boolean; samples: string[] }

const examples: Setlist[] = [
  { id: 's1', name: 'Noche acústica', count: 8, updated: 'Hoy', color: 'from-violet-500/35 to-fuchsia-400/10', starred: true, samples: ['Luz de la ciudad', 'Vuelvo a empezar', 'Casa abierta'] },
  { id: 's2', name: 'Domingo por la mañana', count: 12, updated: 'Ayer', color: 'from-sky-500/30 to-cyan-300/10', samples: ['Todo en tus manos', 'Aquí estoy', 'Un nuevo día'] },
  { id: 's3', name: 'Repertorio base', count: 16, updated: '12 oct', color: 'from-amber-500/30 to-orange-300/10', samples: ['Voces', 'Volver al mar', 'Sin temor'] },
  { id: 's4', name: 'Ensayo nuevo', count: 0, updated: 'Sin canciones', color: 'from-emerald-500/25 to-teal-300/10', samples: [] },
  { id: 's5', name: 'Cierre de año', count: 10, updated: '3 oct', color: 'from-rose-500/30 to-pink-300/10', samples: ['Última canción', 'De aquí al sol', 'A casa'] },
]

export type SetlistsVariant = 'visual' | 'compact' | 'next-up'

export function SetlistsExperiencePrototype({ variant }: { variant: SetlistsVariant }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'filled' | 'empty'>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [created, setCreated] = useState(false)
  const [notice, setNotice] = useState('')
  const lists = useMemo(() => examples.filter((list) =>
    list.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    (filter === 'all' || (filter === 'filled' ? list.count > 0 : list.count === 0))), [filter, query])
  const title = variant === 'visual' ? 'Tus listas, a primera vista' : variant === 'compact' ? 'Todo tu repertorio, en orden' : 'Prepara lo que sigue'
  const description = variant === 'next-up' ? 'Retoma donde lo dejaste o empieza una lista para tu próximo encuentro.' : 'Encuentra una lista o arma la siguiente en segundos.'

  function createList() {
    setCreated(true)
    setNotice('Borrador de lista creado. Puedes empezar a agregar canciones.')
  }

  return <GroupShellProvider value={{ groupId: 'storybook-group', pathname: '/app/g/storybook/setlists', search: '', user: { id: 'storybook-user', email: 'storybook@example.test', emailConfirmed: true, displayName: 'Storybook' }, navigate: () => undefined, navigationMode: 'legacy' }}>
    <main className="mx-auto w-full max-w-6xl space-y-7 p-5 sm:p-8" data-testid={`setlists-${variant}`}>
      <GroupPageHeader title={title} subtitle={description} icon={ListMusic} breadcrumb={[{ label: 'Sonido del Valle' }, { label: 'Listas' }]} actions={<><span className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 text-sm font-semibold text-ink"><ListMusic size={17} className="text-primary-ink" />{examples.length} listas</span><GroupButton onClick={createList} className="min-h-11"><Plus size={18} />Nueva lista</GroupButton></>} />

      {created && <div role="status" className="rounded-xl border border-primary/25 bg-primary/10 p-4 text-sm text-ink">Lista nueva · borrador <button className="ml-3 font-semibold text-primary-ink underline" onClick={() => setNotice('Abriendo el borrador de lista.')}>Agregar canciones</button></div>}
      {notice && <p aria-live="polite" className="sr-only">{notice}</p>}

      <section aria-label="Buscar y filtrar listas" className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <label className="relative min-w-48 flex-1">
          <Search aria-hidden="true" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <span className="sr-only">Buscar listas</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar listas…" className="h-11 w-full rounded-xl border border-border-subtle bg-canvas pl-10 pr-3 text-sm text-ink outline-primary" />
        </label>
        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          <GroupButton variant="secondary" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} aria-hidden="true" />Más filtros</GroupButton>
        </div>
        </div>
        <div className={filtersOpen ? 'flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3' : 'hidden'} aria-label="Mostrar listas">
          {(['all', 'filled', 'empty'] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-xl px-3 text-sm font-medium transition ${filter === value ? 'bg-primary/15 text-primary-ink' : 'text-muted hover:bg-surface-hover'}`}>{value === 'all' ? 'Todas' : value === 'filled' ? 'Con canciones' : 'Vacías'}</button>)}
        </div>
      </section>

      {variant === 'next-up' && <section aria-labelledby="resume-heading" className="overflow-hidden rounded-2xl border border-border-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-5"><div><h2 id="resume-heading" className="font-semibold text-ink">Continúa preparando</h2><p className="mt-0.5 text-sm text-muted">Tu lista más reciente, lista para seguir editando.</p></div><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-ink">Actualizada hoy</span></div>
        {(() => { const item = examples[0]!; return <button onClick={() => setNotice(`Abriendo ${item.name}`)} className="group grid w-full gap-4 p-4 text-left hover:bg-surface-hover/60 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)] sm:items-center sm:p-5">
          <span className={`relative flex min-h-40 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br ${item.color} p-4`}><span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-44 w-44 rounded-full border border-white/15 shadow-[0_0_0_22px_rgba(255,255,255,.025),0_0_0_48px_rgba(255,255,255,.02)]"/><span className="relative flex items-center gap-2 text-sm font-medium text-ink"><ListMusic size={17}/>{item.count} canciones</span><span className="relative grid grid-cols-3 gap-2" aria-hidden="true">{item.samples.map((song) => <span key={song} className="flex min-h-16 items-end rounded-lg border border-white/20 bg-black/10 p-2 text-xs font-semibold text-ink">{song}</span>)}</span></span>
          <span className="flex min-w-0 items-center gap-3"><span className="min-w-0 flex-1"><span className="block text-lg font-semibold text-ink group-hover:text-primary-ink">{item.name}</span><span className="mt-1 block text-sm text-muted">Editada {item.updated} · {item.count} canciones</span><span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-strong px-4 text-sm font-semibold text-primary-foreground">Seguir editando<ArrowRight size={16}/></span></span>{item.starred && <Star size={18} fill="currentColor" className="self-start text-primary-ink" aria-label="Favorita"/>}</span>
        </button> })()}
      </section>}

      {variant === 'next-up' && <div className="flex items-baseline justify-between gap-3"><h2 className="text-base font-semibold text-ink">Todas tus listas</h2><span className="text-sm text-muted">{lists.length} visibles</span></div>}
      {lists.length === 0 ? <div className="rounded-2xl border border-dashed border-border-subtle p-10 text-center"><ListMusic className="mx-auto mb-3 text-muted" /><h2 className="font-semibold text-ink">No hay listas con ese nombre</h2><p className="mt-1 text-sm text-muted">Prueba otra búsqueda o cambia el filtro.</p><button onClick={() => { setQuery(''); setFilter('all') }} className="mt-3 min-h-11 px-3 font-semibold text-primary-ink">Limpiar búsqueda</button></div> : variant === 'visual' ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="setlist-results">
        {lists.map((list) => <button key={list.id} onClick={() => setNotice(`Abriendo ${list.name}`)} className="group overflow-hidden rounded-2xl border border-border-subtle bg-surface text-left transition hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-primary">
          <span className={`relative flex h-36 items-end bg-gradient-to-br ${list.color} p-4`}><span className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-black/10 text-ink"><ListMusic /></span>{list.starred && <Star size={18} fill="currentColor" className="absolute right-4 top-4 text-primary-ink" aria-label="Favorita" />}</span>
          <span className="flex items-center gap-3 p-4"><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{list.name}</span><span className="mt-1 block text-sm text-muted">{list.count ? `${list.count} canciones` : 'Empieza agregando canciones'} · {list.updated}</span></span><ArrowRight size={18} className="text-muted transition group-hover:translate-x-1" /></span>
        </button>)}
      </div> : variant === 'compact' ? <ul className="divide-y divide-border-subtle border-y border-border-subtle" data-testid="setlist-results">
        {lists.map((list) => <li key={list.id}><button onClick={() => setNotice(`Abriendo ${list.name}`)} className="flex min-h-20 w-full items-center gap-4 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${list.color} text-ink`}><ListMusic /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink">{list.name}</span><span className="block text-sm text-muted">{list.count ? `${list.count} canciones` : 'Lista vacía'} · {list.updated}</span></span>{list.starred && <Star size={17} className="text-primary-ink" fill="currentColor" aria-label="Favorita" />}</button></li>)}
      </ul> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="setlist-results">
        {lists.map((list) => <button key={list.id} onClick={() => setNotice(`Abriendo ${list.name}`)} className="group flex min-h-36 items-start gap-4 rounded-2xl border border-border-subtle bg-surface p-4 text-left transition hover:border-primary/30 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${list.color} text-primary-ink`}><ListMusic/></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink group-hover:text-primary-ink">{list.name}</span><span className="mt-1 block text-sm text-muted">{list.count ? `${list.count} canciones` : 'Lista vacía'} · {list.updated}</span>{list.samples.length > 0 && <span className="mt-3 flex flex-wrap gap-1.5">{list.samples.slice(0, 2).map((song) => <span key={song} className="inline-flex min-h-7 items-center rounded-full bg-surface-hover px-2.5 text-xs text-muted">{song}</span>)}</span>}{list.count === 0 && <span className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-primary-ink"><Plus size={14}/>Agregar canciones</span>}</span><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted group-hover:text-primary-ink"><ArrowRight size={18}/></span></button>)}
      </div>}
    </main>
  </GroupShellProvider>
}
