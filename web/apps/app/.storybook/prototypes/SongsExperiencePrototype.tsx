import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Heart,
  Headphones,
  ListMusic,
  Music2,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useT } from '../../src/i18n'
import {
  GroupActionMenu,
  GroupButton,
  GroupCard,
  GroupChip,
  GroupDialog,
  GroupInput,
  GroupSelect,
  GroupTextArea,
} from '../../src/groups/ui'
import { cn } from '../../src/ui/cn'

type PrototypeVariant = 'guided' | 'workspace' | 'catalog'
type Screen = 'library' | 'detail' | 'songEdit' | 'arrangementEdit' | 'practice'
type SongTab = 'lyrics' | 'chords' | 'notes' | 'files'
type PracticeTab = 'estudiar' | 'calentar' | 'avanzado' | 'afinar'

type Arrangement = {
  id: string
  label: string
  key: string
  bpm: number
  lyrics: string
  chords: string
  notes: string
  resources: { id: string; label: string; purpose: 'audio' | 'chart' }[]
}

type Song = {
  id: string
  title: string
  attribution: string
  origin: 'original' | 'cover' | 'other'
  genre: string
  tags: string[]
  favorite: boolean
  updated: string
  arrangements: Arrangement[]
}

type NewVersion = { id: string; name: string; key: string; bpm: string; audioName: string }
type SongDraft = Pick<Song, 'title' | 'attribution' | 'origin' | 'genre'> & { tags: string; rights: string }

const INITIAL_SONGS: Song[] = [
  {
    id: 'light',
    title: 'Camino de luz',
    attribution: 'Sonivo Demo',
    origin: 'original',
    genre: 'Pop acústico',
    tags: ['demo', 'grupo'],
    favorite: true,
    updated: 'Actualizada hoy',
    arrangements: [
      {
        id: 'light-main',
        label: 'Versión del grupo',
        key: 'Sol mayor',
        bpm: 92,
        lyrics: 'Caminamos juntos\ncon una misma voz.\n\nHoy comienza el canto\ny nos une su canción.',
        chords: '[G]Caminamos [D]juntos\n[Em]con una [C]misma voz.',
        notes: 'Entrada suave; subir un poco la voz en el último coro.',
        resources: [
          { id: 'light-audio', label: 'Referencia de voz.mp3', purpose: 'audio' },
          { id: 'light-chart', label: 'Guía del grupo.pdf', purpose: 'chart' },
        ],
      },
      {
        id: 'light-low',
        label: 'Voces graves',
        key: 'Mi mayor',
        bpm: 92,
        lyrics: 'Caminamos juntos\ncon una misma voz.\n\nHoy comienza el canto\ny nos une su canción.',
        chords: '[E]Caminamos [B]juntos\n[C#m]con una [A]misma voz.',
        notes: 'Tonalidad cómoda para voces graves.',
        resources: [{ id: 'light-low-audio', label: 'Guía voces graves.mp3', purpose: 'audio' }],
      },
    ],
  },
  {
    id: 'morning',
    title: 'Voces al amanecer',
    attribution: 'Canción del grupo',
    origin: 'original',
    genre: 'Acústica',
    tags: ['acústica'],
    favorite: false,
    updated: 'Actualizada ayer',
    arrangements: [
      {
        id: 'morning-main',
        label: 'Versión del grupo',
        key: 'Do mayor',
        bpm: 84,
        lyrics: 'La mañana nos encuentra\ncon ganas de cantar.',
        chords: '[C]La mañana nos [F]encuentra\n[G]con ganas de [C]cantar.',
        notes: '',
        resources: [],
      },
    ],
  },
  {
    id: 'hope',
    title: 'Canto de esperanza',
    attribution: 'María del Mar',
    origin: 'cover',
    genre: 'Balada',
    tags: ['reunión'],
    favorite: false,
    updated: 'Actualizada hace 3 días',
    arrangements: [],
  },
  {
    id: 'together',
    title: 'Una sola voz',
    attribution: 'Tradicional',
    origin: 'other',
    genre: 'Tradicional',
    tags: ['grupo'],
    favorite: false,
    updated: 'Actualizada hace una semana',
    arrangements: [
      {
        id: 'together-main',
        label: 'Versión del grupo',
        key: 'Re mayor',
        bpm: 108,
        lyrics: 'Una sola voz\nllena este lugar.',
        chords: '[D]Una sola [A]voz\n[G]llena este [D]lugar.',
        notes: '',
        resources: [{ id: 'together-audio', label: 'Pista de referencia.wav', purpose: 'audio' }],
      },
    ],
  },
]

const SONG_TABS: SongTab[] = ['lyrics', 'chords', 'notes', 'files']
const PRACTICE_TABS: PracticeTab[] = ['estudiar', 'calentar', 'avanzado', 'afinar']

const EMPTY_DRAFT: SongDraft = {
  title: '',
  attribution: '',
  origin: 'original',
  genre: '',
  tags: '',
  rights: '',
}

function labels(t: (key: Parameters<ReturnType<typeof useT>['t']>[0]) => string) {
  return {
    lyrics: t('song.tabLyrics'),
    chords: t('song.tabChords'),
    notes: t('song.tabNotes'),
    files: t('song.tabFiles'),
  }
}

function variantName(variant: PrototypeVariant) {
  return {
    guided: 'Lista guiada',
    workspace: 'Espacio de ensayo',
    catalog: 'Repertorio compacto',
  }[variant]
}

function variantLetter(variant: PrototypeVariant) {
  return variant === 'guided' ? 'A' : variant === 'workspace' ? 'B' : 'C'
}

/** Storybook-only mock. All edits and navigation remain in memory; no API calls are made. */
export function SongsExperiencePrototype({ variant }: { variant: PrototypeVariant }) {
  const { t } = useT()
  const [songs, setSongs] = useState<Song[]>(() => INITIAL_SONGS.map((song) => ({ ...song })))
  const [screen, setScreen] = useState<Screen>('library')
  const [selectedSongId, setSelectedSongId] = useState('light')
  const [selectedArrangementId, setSelectedArrangementId] = useState('light-main')
  const [activeSongTab, setActiveSongTab] = useState<SongTab>('lyrics')
  const [activePracticeTab, setActivePracticeTab] = useState<PracticeTab>('estudiar')
  const [query, setQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [themeFilter, setThemeFilter] = useState('')
  const [sort, setSort] = useState<'recent' | 'title' | 'artist'>('recent')
  const [ascending, setAscending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [songDraft, setSongDraft] = useState<SongDraft>(EMPTY_DRAFT)
  const [rightsDraft, setRightsDraft] = useState('')
  const [newVersions, setNewVersions] = useState<NewVersion[]>([])
  const [showSongOptional, setShowSongOptional] = useState(false)
  const [expandedVersionIds, setExpandedVersionIds] = useState<string[]>([])
  const [versionLabelDraft, setVersionLabelDraft] = useState('')
  const [isCreatingArrangement, setIsCreatingArrangement] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [bpmDraft, setBpmDraft] = useState('')
  const [lyricDraft, setLyricDraft] = useState('')
  const [chordDraft, setChordDraft] = useState('')
  const [editorMode, setEditorMode] = useState<'lyrics' | 'chords' | 'timing'>('lyrics')
  const [semitones, setSemitones] = useState(0)
  const [metronomeOn, setMetronomeOn] = useState(false)
  const [tunerOn, setTunerOn] = useState(false)
  const [followLyrics, setFollowLyrics] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [practiceView, setPracticeView] = useState<'singer' | 'guitarist'>('singer')
  const [exercise, setExercise] = useState(1)

  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? songs[0]
  const selectedArrangement = selectedSong?.arrangements.find((item) => item.id === selectedArrangementId)
    ?? selectedSong?.arrangements[0]
  const allThemes = Array.from(new Set(songs.flatMap((song) => song.tags))).sort((a, b) => a.localeCompare(b))

  const visibleSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const results = songs.filter((song) => {
      const matchesQuery = !normalizedQuery || [song.title, song.attribution, song.genre, ...song.tags]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return matchesQuery && (!favoritesOnly || song.favorite) && (!themeFilter || song.tags.includes(themeFilter))
    })
    return results.sort((a, b) => {
      const left = sort === 'title' ? a.title : sort === 'artist' ? a.attribution : a.updated
      const right = sort === 'title' ? b.title : sort === 'artist' ? b.attribution : b.updated
      return left.localeCompare(right) * (ascending ? 1 : -1)
    })
  }, [ascending, favoritesOnly, query, sort, songs, themeFilter])

  const copy = labels(t)
  const originLabels = [
    { value: 'original', label: t('song.originOriginal') },
    { value: 'cover', label: t('song.originCover') },
    { value: 'other', label: t('song.originOther') },
  ]

  function chooseSong(song: Song) {
    setSelectedSongId(song.id)
    setSelectedArrangementId(song.arrangements[0]?.id ?? '')
    setActiveSongTab('lyrics')
    setScreen('detail')
  }

  function startSongEdit(songOverride?: Song) {
    const songToEdit = songOverride ?? selectedSong
    if (!songToEdit) return
    setSongDraft({
      title: songToEdit.title,
      attribution: songToEdit.attribution,
      origin: songToEdit.origin,
      genre: songToEdit.genre,
      tags: songToEdit.tags.join(', '),
      rights: rightsDraft,
    })
    setScreen('songEdit')
  }

  function startArrangementEdit(forceNew = false) {
    const arrangementToEdit = forceNew ? undefined : selectedArrangement
    setIsCreatingArrangement(!arrangementToEdit)
    setVersionLabelDraft(arrangementToEdit?.label ?? '')
    setKeyDraft(arrangementToEdit?.key ?? '')
    setBpmDraft(arrangementToEdit ? String(arrangementToEdit.bpm) : '')
    setLyricDraft(arrangementToEdit?.lyrics ?? '')
    setChordDraft(arrangementToEdit?.chords ?? '')
    setEditorMode('lyrics')
    setScreen('arrangementEdit')
  }

  function saveSongEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSongs((current) => current.map((song) => song.id === selectedSong?.id
      ? {
          ...song,
          title: songDraft.title.trim(),
          attribution: songDraft.attribution.trim(),
          origin: songDraft.origin,
          genre: songDraft.genre.trim(),
          tags: songDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }
      : song))
    setRightsDraft(songDraft.rights)
    setMessage(t('song.save'))
    setScreen('detail')
  }

  function saveArrangementEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const newArrangementId = `prototype-arrangement-${Date.now()}`
    setSongs((current) => current.map((song) => song.id !== selectedSong?.id ? song : {
      ...song,
      arrangements: isCreatingArrangement
        ? [...song.arrangements, { id: newArrangementId, label: versionLabelDraft.trim() || t('songCreate.wizardArrangeTitle'), key: keyDraft, bpm: Number(bpmDraft) || 0, lyrics: lyricDraft, chords: chordDraft, notes: '', resources: [] }]
        : song.arrangements.map((arrangement) => arrangement.id !== selectedArrangement?.id ? arrangement : {
            ...arrangement,
            label: versionLabelDraft,
            key: keyDraft,
            bpm: Number(bpmDraft) || arrangement.bpm,
            lyrics: lyricDraft,
            chords: chordDraft,
          }),
    }))
    if (isCreatingArrangement) setSelectedArrangementId(newArrangementId)
    setIsCreatingArrangement(false)
    setMessage(t('arrangement.save'))
    setScreen('detail')
  }

  function addNewVersion() {
    setNewVersions((versions) => [...versions, { id: `new-${Date.now()}-${versions.length}`, name: '', key: '', bpm: '', audioName: '' }])
  }

  function createSong(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = `prototype-${Date.now()}`
    const arrangements: Arrangement[] = newVersions.map((version, index) => ({
      id: `${id}-arrangement-${index + 1}`,
      label: version.name.trim() || `${t('songCreate.wizardVersionNumber', { number: index + 1 })}`,
      key: version.key,
      bpm: Number(version.bpm) || 0,
      lyrics: '',
      chords: '',
      notes: '',
      resources: version.audioName ? [{ id: `${id}-audio-${index}`, label: version.audioName, purpose: 'audio' }] : [],
    }))
    const song: Song = {
      id,
      title: songDraft.title.trim(),
      attribution: songDraft.attribution.trim(),
      origin: songDraft.origin,
      genre: songDraft.genre.trim(),
      tags: songDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      favorite: false,
      updated: t('songs.refreshing'),
      arrangements,
    }
    setSongs((current) => [song, ...current])
    setSelectedSongId(id)
    setSelectedArrangementId(arrangements[0]?.id ?? '')
    setCreateOpen(false)
    setSongDraft(EMPTY_DRAFT)
    setNewVersions([])
    setShowSongOptional(false)
    setMessage(t('songCreate.wizardDoneBody'))
    setScreen('detail')
  }

  function toggleFavorite(songId: string) {
    setSongs((current) => current.map((song) => song.id === songId ? { ...song, favorite: !song.favorite } : song))
  }

  function openCreation() {
    setSongDraft(EMPTY_DRAFT)
    setNewVersions([])
    setCreateOpen(true)
  }

  function removeSong() {
    if (!selectedSong || deleteText !== selectedSong.title) return
    setSongs((current) => current.filter((song) => song.id !== selectedSong.id))
    setDeleteOpen(false)
    setDeleteText('')
    setScreen('library')
    setMessage(t('song.deleteSong'))
  }

  function handleSongTabKey(event: KeyboardEvent<HTMLButtonElement>, current: SongTab) {
    const index = SONG_TABS.indexOf(current)
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (index + 1) % SONG_TABS.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (index - 1 + SONG_TABS.length) % SONG_TABS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? SONG_TABS.length - 1
            : -1
    if (next < 0) return
    event.preventDefault()
    setActiveSongTab(SONG_TABS[next]!)
    document.getElementById(`prototype-song-tab-${SONG_TABS[next]}`)?.focus()
  }

  function handlePracticeTabKey(event: KeyboardEvent<HTMLButtonElement>, current: PracticeTab) {
    const index = PRACTICE_TABS.indexOf(current)
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? (index + 1) % PRACTICE_TABS.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? (index - 1 + PRACTICE_TABS.length) % PRACTICE_TABS.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? PRACTICE_TABS.length - 1
            : -1
    if (next < 0) return
    event.preventDefault()
    setActivePracticeTab(PRACTICE_TABS[next]!)
    document.getElementById(`prototype-practice-tab-${PRACTICE_TABS[next]}`)?.focus()
  }

  const shellClass = 'min-h-screen bg-canvas text-ink'
  const pageWidthClass = variant === 'workspace' ? 'max-w-[1500px]' : 'max-w-[1260px]'

  return (
    <div className={shellClass} data-testid="songs-prototype" data-variant={variant}>
      <PrototypeNotice variant={variant} />
      <PrototypeTopBar variant={variant} />
      <main className={cn('mx-auto w-full px-4 pb-24 pt-6 sm:px-6 lg:px-9', pageWidthClass)}>
        {screen === 'library' ? (
          <LibraryScreen
            variant={variant}
            songs={visibleSongs}
            selectedSong={selectedSong}
            query={query}
            setQuery={setQuery}
            favoritesOnly={favoritesOnly}
            setFavoritesOnly={setFavoritesOnly}
            themeFilter={themeFilter}
            setThemeFilter={setThemeFilter}
            themes={allThemes}
            sort={sort}
            setSort={setSort}
            ascending={ascending}
            setAscending={setAscending}
            onChooseSong={chooseSong}
            onToggleFavorite={toggleFavorite}
            onCreate={openCreation}
            onEdit={(song) => { setSelectedSongId(song.id); setSelectedArrangementId(song.arrangements[0]?.id ?? ''); startSongEdit(song) }}
            moreFiltersOpen={moreFiltersOpen}
            setMoreFiltersOpen={setMoreFiltersOpen}
            t={t}
          />
        ) : null}

        {screen === 'detail' && selectedSong ? (
          <SongDetailScreen
            variant={variant}
            song={selectedSong}
            arrangement={selectedArrangement}
            activeTab={activeSongTab}
            setActiveTab={setActiveSongTab}
            onTabKeyDown={handleSongTabKey}
            onBack={() => setScreen('library')}
            onPractice={() => { setActivePracticeTab('estudiar'); setScreen('practice') }}
            onEditSong={() => startSongEdit()}
            onEditArrangement={() => startArrangementEdit()}
            onAddArrangement={() => startArrangementEdit(true)}
            onSelectArrangement={setSelectedArrangementId}
            onToggleFavorite={toggleFavorite}
            onDelete={() => { setDeleteText(''); setDeleteOpen(true) }}
            onPlay={() => setIsPlaying((playing) => !playing)}
            isPlaying={isPlaying}
            t={t}
          />
        ) : null}

        {screen === 'songEdit' && selectedSong ? (
          <SongEditScreen
            song={selectedSong}
            draft={songDraft}
            setDraft={setSongDraft}
            onSave={saveSongEdit}
            onCancel={() => setScreen('detail')}
            originOptions={originLabels}
            t={t}
          />
        ) : null}

        {screen === 'arrangementEdit' && selectedSong ? (
          <ArrangementEditScreen
            song={selectedSong}
            arrangement={isCreatingArrangement ? undefined : selectedArrangement}
            isCreatingArrangement={isCreatingArrangement}
            mode={editorMode}
            setMode={setEditorMode}
            label={versionLabelDraft}
            setLabel={setVersionLabelDraft}
            keyValue={keyDraft}
            setKeyValue={setKeyDraft}
            bpm={bpmDraft}
            setBpm={setBpmDraft}
            lyrics={lyricDraft}
            setLyrics={setLyricDraft}
            chords={chordDraft}
            setChords={setChordDraft}
            onSave={saveArrangementEdit}
            onCancel={() => { setIsCreatingArrangement(false); setScreen('detail') }}
            onPractice={() => setScreen('practice')}
            t={t}
          />
        ) : null}

        {screen === 'practice' && selectedSong ? (
          <PracticeScreen
            song={selectedSong}
            arrangement={selectedArrangement}
            activeTab={activePracticeTab}
            setActiveTab={setActivePracticeTab}
            onTabKeyDown={handlePracticeTabKey}
            semitones={semitones}
            setSemitones={setSemitones}
            metronomeOn={metronomeOn}
            setMetronomeOn={setMetronomeOn}
            tunerOn={tunerOn}
            setTunerOn={setTunerOn}
            followLyrics={followLyrics}
            setFollowLyrics={setFollowLyrics}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            practiceView={practiceView}
            setPracticeView={setPracticeView}
            exercise={exercise}
            setExercise={setExercise}
            onBack={() => setScreen('detail')}
            onEditArrangement={startArrangementEdit}
            t={t}
          />
        ) : null}
      </main>

      {message ? (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2" role="status" aria-live="polite">
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-ink shadow-lg">
            <Check className="h-4 w-4 text-success-ink" aria-hidden="true" />
            <span>{message}</span>
            <button className="ml-2 rounded-lg p-1 text-muted focus-visible:outline-2 focus-visible:outline-primary" aria-label={t('common.close')} onClick={() => setMessage('')}><X className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}

      <CreateSongDialog
        open={createOpen}
        draft={songDraft}
        setDraft={setSongDraft}
        versions={newVersions}
        setVersions={setNewVersions}
        optionalOpen={showSongOptional}
        setOptionalOpen={setShowSongOptional}
        expandedVersionIds={expandedVersionIds}
        toggleVersionDetails={(id) => setExpandedVersionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
        originOptions={originLabels}
        onClose={() => setCreateOpen(false)}
        onAddVersion={addNewVersion}
        onSubmit={createSong}
        t={t}
      />

      <GroupDialog
        open={deleteOpen}
        title={t('song.deleteTitle')}
        description={t('song.deleteBody')}
        onClose={() => setDeleteOpen(false)}
        confirmDiscard
        footer={(close) => (
          <div className="flex flex-wrap justify-end gap-2">
            <GroupButton variant="secondary" onClick={close}>{t('song.cancel')}</GroupButton>
            <GroupButton variant="danger" disabled={deleteText !== selectedSong?.title} onClick={removeSong}>{t('song.deleteSong')}</GroupButton>
          </div>
        )}
      >
        <div className="space-y-4">
          <p>{t('song.deleteConfirmInstruction', { title: selectedSong?.title ?? '' })}</p>
          <GroupInput label={t('song.deleteConfirmLabel')} value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" />
        </div>
      </GroupDialog>
    </div>
  )
}

function PrototypeNotice({ variant }: { variant: PrototypeVariant }) {
  return (
    <div className={cn('flex min-h-9 items-center justify-center gap-2 px-4 text-center text-xs font-medium', variant === 'catalog' ? 'border-b border-border-subtle bg-surface text-muted' : 'bg-primary-strong font-semibold text-primary-foreground')}>
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Propuesta visual en Storybook · datos y cambios de demostración, no se guardan</span>
    </div>
  )
}

function PrototypeTopBar({ variant }: { variant: PrototypeVariant }) {
  return (
    <header className="border-b border-border-subtle bg-shell text-shell-foreground">
      <div className="mx-auto flex min-h-14 max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-9">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-ink"><Music2 className="h-5 w-5" aria-hidden="true" /></span>
          <span className="truncate font-semibold">Sonivo</span>
          <span aria-hidden="true" className="text-muted">/</span>
          <span className="truncate text-sm text-muted">Grupo de demostración</span>
        </div>
        <span className="hidden text-xs text-muted sm:inline">Propuesta {variantLetter(variant)} · {variantName(variant)}</span>
      </div>
    </header>
  )
}

type TFunction = ReturnType<typeof useT>['t']

function LibraryScreen(props: {
  variant: PrototypeVariant
  songs: Song[]
  selectedSong: Song | undefined
  query: string
  setQuery: (value: string) => void
  favoritesOnly: boolean
  setFavoritesOnly: (value: boolean) => void
  themeFilter: string
  setThemeFilter: (value: string) => void
  themes: string[]
  sort: 'recent' | 'title' | 'artist'
  setSort: (value: 'recent' | 'title' | 'artist') => void
  ascending: boolean
  setAscending: (value: boolean) => void
  onChooseSong: (song: Song) => void
  onToggleFavorite: (id: string) => void
  onCreate: () => void
  onEdit: (song: Song) => void
  moreFiltersOpen: boolean
  setMoreFiltersOpen: (value: boolean) => void
  t: TFunction
}) {
  const { variant, songs, selectedSong, onCreate, t } = props
  const toolBar = <LibraryToolbar {...props} />
  const heading = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t('songs.pageTitle')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{t('songs.pageSubtitle')}</p>
      </div>
      <GroupButton className="shrink-0" onClick={onCreate}><Plus className="h-4 w-4" aria-hidden="true" />{t('songs.addSong')}</GroupButton>
    </div>
  )

  if (variant === 'workspace') {
    return (
      <section className="space-y-5" aria-labelledby="prototype-library-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-primary-ink">{t('songs.tabsLabel')}</p>
            <h1 id="prototype-library-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">{t('songs.pageTitle')}</h1>
          </div>
          <GroupButton onClick={onCreate}><Plus className="h-4 w-4" aria-hidden="true" />{t('songs.addSong')}</GroupButton>
        </div>
        <div className="grid min-h-[calc(100vh-13rem)] gap-4 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.6fr)]">
          <aside className="min-w-0 rounded-2xl border border-border-subtle bg-surface p-4" aria-label={t('songs.tabsLabel')}>
            <LibraryToolbar {...props} compact />
            <div className="mt-4 divide-y divide-border-subtle">
              {songs.map((song) => (
                <button key={song.id} type="button" aria-current={song.id === selectedSong?.id ? 'true' : undefined} onClick={() => props.onChooseSong(song)} className={cn('flex min-h-16 w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary', song.id === selectedSong?.id && 'bg-primary/10')}>
                  <Music2 className="mt-1 h-4 w-4 shrink-0 text-primary-ink" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{song.title}</span>
                    <span className="block truncate text-sm text-muted">{song.attribution || t('songs.unknownAttribution')}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{song.arrangements.length}</span>
                </button>
              ))}
              {songs.length === 0 ? <p className="px-3 py-8 text-sm text-muted">{t('setlists.noResultsBody')}</p> : null}
            </div>
          </aside>
          <div className="min-w-0">
            {selectedSong ? (
              <SongWorkspacePreview song={selectedSong} t={t} onChooseSong={props.onChooseSong} onToggleFavorite={props.onToggleFavorite} />
            ) : <EmptyLibrary t={t} onCreate={onCreate} />}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className={cn('space-y-6', variant === 'catalog' && 'space-y-8')} aria-labelledby="prototype-library-heading">
      {heading}
      <div className={cn('space-y-4', variant === 'guided' && 'rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5', variant === 'catalog' && 'space-y-5')}>
        {toolBar}
        {variant === 'catalog' ? (
          <div>
            <p className="mb-3 px-1 text-sm text-muted">{t('songs.resultsRange', { first: songs.length ? 1 : 0, last: songs.length, total: songs.length })}</p>
            <ul aria-label={t('songs.tabsLabel')} className="divide-y divide-border-subtle border-y border-border-subtle">
              {songs.map((song) => <SongListRow key={song.id} variant="catalog" song={song} t={t} onChoose={() => props.onChooseSong(song)} onFavorite={() => props.onToggleFavorite(song.id)} onEdit={() => props.onEdit(song)} />)}
              {songs.length === 0 ? <li className="py-4"><EmptyLibrary t={t} onCreate={onCreate} /></li> : null}
            </ul>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">{t('songs.resultsRange', { first: songs.length ? 1 : 0, last: songs.length, total: songs.length })}</p>
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
              {songs.map((song) => <SongListRow key={song.id} variant={variant} song={song} t={t} onChoose={() => props.onChooseSong(song)} onFavorite={() => props.onToggleFavorite(song.id)} onEdit={() => props.onEdit(song)} />)}
              {songs.length === 0 ? <li className="p-4"><EmptyLibrary t={t} onCreate={onCreate} /></li> : null}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}

function LibraryToolbar(props: LibraryScreenProps & { compact?: boolean }) {
  const { variant, t, query, setQuery, favoritesOnly, setFavoritesOnly, themeFilter, setThemeFilter, themes, sort, setSort, ascending, setAscending, moreFiltersOpen, setMoreFiltersOpen, compact } = props
  return (
    <div className={cn('flex flex-col gap-3', compact && 'gap-3', variant === 'catalog' && 'md:flex-row md:items-center md:gap-4')}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <GroupInput type="search" aria-label={t('songs.searchSongs')} placeholder={t('songs.searchSongs')} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" />
      </div>
      <div className={cn('flex flex-wrap items-center gap-2', variant === 'catalog' && 'md:shrink-0')}>
        <GroupButton variant={favoritesOnly ? 'soft' : 'ghost'} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)} className={cn(variant === 'catalog' && 'rounded-lg px-3')}>
          <Heart className="h-4 w-4" aria-hidden="true" fill={favoritesOnly ? 'currentColor' : 'none'} />{t('songs.tabFavorites')}
        </GroupButton>
        <label className="sr-only" htmlFor={`prototype-theme-${compact ? 'compact' : 'main'}`}>{t('songs.tabByTheme')}</label>
        {variant !== 'catalog' || moreFiltersOpen ? <select id={`prototype-theme-${compact ? 'compact' : 'main'}`} className="min-h-11 min-w-32 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary" value={themeFilter} onChange={(event) => setThemeFilter(event.target.value)}>
          <option value="">{t('songs.tabByTheme')}: {t('songs.tabAll')}</option>
          {themes.map((theme) => <option key={theme} value={theme}>{theme}</option>)}
        </select> : null}
        {!compact && (variant !== 'catalog' || moreFiltersOpen) ? (
          <>
            <label className="sr-only" htmlFor="prototype-song-sort">{t('songs.sortLabel')}</label>
            <select id="prototype-song-sort" className="min-h-11 min-w-36 rounded-xl border border-border-subtle bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary" value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'title' | 'artist')}>
              <option value="recent">{t('songs.sortLabel')}: {t('songs.sortRecent')}</option>
              <option value="title">{t('songs.sortLabel')}: {t('songs.sortTitle')}</option>
              <option value="artist">{t('songs.sortLabel')}: {t('songs.sortArtist')}</option>
            </select>
            <GroupButton variant="secondary" size="icon" aria-label={t(ascending ? 'songs.sortAscending' : 'songs.sortDescending')} onClick={() => setAscending(!ascending)}>{ascending ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}</GroupButton>
          </>
        ) : null}
        <GroupButton variant="secondary" aria-expanded={moreFiltersOpen} aria-label={t('songs.moreOptions', { title: t('songs.pageTitle') })} onClick={() => setMoreFiltersOpen(!moreFiltersOpen)} className={cn(variant === 'catalog' && 'min-h-10 rounded-lg')}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{variant === 'catalog' ? t('stage.moreOptions') : t('songs.moreOptions', { title: t('songs.pageTitle') })}
        </GroupButton>
      </div>
      {moreFiltersOpen ? (
        <div className="flex justify-end border-t border-border-subtle pt-2">
          <GroupButton size="sm" variant="ghost" onClick={() => { setQuery(''); setFavoritesOnly(false); setThemeFilter(''); setSort('recent'); setAscending(false) }}>{t('people.clearFilters')}</GroupButton>
        </div>
      ) : null}
    </div>
  )
}

type LibraryScreenProps = {
  variant: PrototypeVariant
  songs: Song[]
  selectedSong: Song | undefined
  query: string
  setQuery: (value: string) => void
  favoritesOnly: boolean
  setFavoritesOnly: (value: boolean) => void
  themeFilter: string
  setThemeFilter: (value: string) => void
  themes: string[]
  sort: 'recent' | 'title' | 'artist'
  setSort: (value: 'recent' | 'title' | 'artist') => void
  ascending: boolean
  setAscending: (value: boolean) => void
  onChooseSong: (song: Song) => void
  onToggleFavorite: (id: string) => void
  onCreate: () => void
  onEdit: (song: Song) => void
  moreFiltersOpen: boolean
  setMoreFiltersOpen: (value: boolean) => void
  t: TFunction
}

function SongListRow({ variant, song, t, onChoose, onFavorite, onEdit }: { variant: PrototypeVariant; song: Song; t: TFunction; onChoose: () => void; onFavorite: () => void; onEdit: () => void }) {
  return (
    <li className={cn('group flex min-w-0 items-center gap-2 px-1 py-2 sm:px-2 sm:py-3', variant === 'catalog' && 'rounded-xl transition-colors hover:bg-surface-hover/60')}>
      <button type="button" onClick={onChoose} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:gap-4">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary-ink', variant === 'catalog' && 'h-12 w-12')}><Music2 className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{song.title}</span>
          <span className="mt-0.5 block truncate text-sm text-muted">{song.attribution || t('songs.unknownAttribution')}{variant === 'catalog' && song.genre ? <span className="hidden sm:inline">{' · '}{song.genre}</span> : null}</span>
        </span>
        {variant === 'catalog' ? <span className="hidden text-sm text-muted xl:block">{song.updated}</span> : null}
        <span className={cn('rounded-full bg-surface-hover px-2.5 py-1 text-xs text-muted', variant === 'catalog' ? 'hidden sm:block' : 'hidden sm:block')}>{song.arrangements.length ? t('song.versionsMany', { count: song.arrangements.length }) : t('song.noArrangementsTitle')}</span>
      </button>
      {variant !== 'guided' ? <button type="button" aria-label={song.favorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })} aria-pressed={song.favorite} onClick={onFavorite} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"><Heart className="h-4 w-4" fill={song.favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button> : null}
      {variant === 'catalog' ? <GroupActionMenu label={t('songs.moreOptions', { title: song.title })} items={[{ key: 'edit', label: t('song.editSong'), icon: Pencil, onSelect: onEdit }]} /> : null}
      {variant === 'guided' ? (
        <GroupActionMenu label={t('songs.moreOptions', { title: song.title })} items={[
          { key: 'favorite', label: song.favorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title }), icon: Heart, onSelect: onFavorite },
          { key: 'edit', label: t('song.editSong'), icon: Pencil, onSelect: onEdit },
        ]} />
      ) : null}
    </li>
  )
}

function SongTableRow({ song, t, onChoose, onFavorite, onEdit }: { song: Song; t: TFunction; onChoose: () => void; onFavorite: () => void; onEdit: () => void }) {
  return (
    <tr className="hover:bg-surface-hover">
      <th scope="row" className="px-4 py-3 font-semibold"><button className="min-h-11 text-left text-primary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary" onClick={onChoose}>{song.title}</button></th>
      <td className="px-3 py-3 text-muted">{song.attribution || t('songs.unknownAttribution')}</td>
      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{song.tags.slice(0, 2).map((tag) => <GroupChip key={tag}>{tag}</GroupChip>)}</div></td>
      <td className="px-3 py-3 text-muted">{song.arrangements.length ? t('song.versionsMany', { count: song.arrangements.length }) : t('song.noArrangementsTitle')}</td>
      <td className="px-3 py-3 text-muted">{song.updated}</td>
      <td className="px-3 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button type="button" aria-label={song.favorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })} aria-pressed={song.favorite} onClick={onFavorite} className="grid h-10 w-10 place-items-center rounded-lg text-primary-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"><Heart className="h-4 w-4" fill={song.favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
          <button type="button" aria-label={t('song.editSong')} onClick={onEdit} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </td>
    </tr>
  )
}

function EmptyLibrary({ t, onCreate }: { t: TFunction; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-subtle bg-surface px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary-ink"><Music2 className="h-6 w-6" aria-hidden="true" /></span>
      <div><h2 className="font-semibold text-ink">{t('songs.emptyTitle')}</h2><p className="mt-1 max-w-sm text-sm text-muted">{t('songs.emptyOwner')}</p></div>
      <GroupButton onClick={onCreate}><Plus className="h-4 w-4" aria-hidden="true" />{t('songs.addSong')}</GroupButton>
    </div>
  )
}

function SongWorkspacePreview({ song, t, onChooseSong, onToggleFavorite }: { song: Song; t: TFunction; onChooseSong: (song: Song) => void; onToggleFavorite: (id: string) => void }) {
  const arrangement = song.arrangements[0]
  return (
    <article className="h-full rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7" aria-labelledby="workspace-song-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{t('songs.pageTitle')}</p>
          <h2 id="workspace-song-title" className="mt-1 text-2xl font-bold tracking-tight">{song.title}</h2>
          <p className="mt-1 text-sm text-muted">{song.attribution}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label={song.favorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })} aria-pressed={song.favorite} onClick={() => onToggleFavorite(song.id)} className="grid h-11 w-11 place-items-center rounded-xl border border-border-subtle text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"><Heart className="h-4 w-4" fill={song.favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
          <GroupButton disabled={!arrangement} onClick={() => onChooseSong(song)}><Play className="h-4 w-4" aria-hidden="true" />{t('song.practiceArrangement')}</GroupButton>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{song.genre ? <GroupChip tone="accent">{song.genre}</GroupChip> : null}{song.tags.map((tag) => <GroupChip key={tag}>{tag}</GroupChip>)}</div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)]">
        <section aria-labelledby="workspace-lyrics-title">
          <h3 id="workspace-lyrics-title" className="font-semibold">{t('song.tabLyrics')}</h3>
          {arrangement ? <p className="mt-3 whitespace-pre-line text-base leading-8 text-ink">{arrangement.lyrics}</p> : <p className="mt-3 text-sm text-muted">{t('song.noArrangementForTabs')}</p>}
        </section>
        <section className="border-t border-border-subtle pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-labelledby="workspace-versions-title">
          <div className="flex items-center gap-2"><ListMusic className="h-4 w-4 text-primary-ink" aria-hidden="true" /><h3 id="workspace-versions-title" className="font-semibold">{t('song.arrangementsTitle')}</h3></div>
          {song.arrangements.map((item) => <button key={item.id} type="button" onClick={() => onChooseSong(song)} className="mt-3 flex min-h-14 w-full items-center justify-between gap-3 border-b border-border-subtle py-3 text-left focus-visible:outline-2 focus-visible:outline-primary"><span><span className="block font-medium">{item.label}</span><span className="text-sm text-muted">{item.key || '—'}{item.bpm > 0 ? ` · ${item.bpm} BPM` : ''}</span></span><ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" /></button>)}
          {song.arrangements.length === 0 ? <p className="mt-3 text-sm text-muted">{t('song.noArrangementsBody')}</p> : null}
        </section>
      </div>
    </article>
  )
}

function SongDetailScreen(props: {
  variant: PrototypeVariant
  song: Song
  arrangement: Arrangement | undefined
  activeTab: SongTab
  setActiveTab: (tab: SongTab) => void
  onTabKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: SongTab) => void
  onBack: () => void
  onPractice: () => void
  onEditSong: () => void
  onEditArrangement: () => void
  onAddArrangement: () => void
  onSelectArrangement: (id: string) => void
  onToggleFavorite: (id: string) => void
  onDelete: () => void
  onPlay: () => void
  isPlaying: boolean
  t: TFunction
}) {
  const { variant, song, arrangement, activeTab, setActiveTab, onTabKeyDown, onBack, onPractice, onEditSong, onEditArrangement, onAddArrangement, onSelectArrangement, onToggleFavorite, onDelete, onPlay, isPlaying, t } = props
  const tabCopy = labels(t)
  const [showAllDetails, setShowAllDetails] = useState(false)
  const arrangementList = (
    <section aria-labelledby="prototype-arrangements-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h2 id="prototype-arrangements-title" className="text-lg font-semibold">{t('song.arrangementsTitle')}</h2><GroupButton size="sm" variant="secondary" onClick={onAddArrangement}><Plus className="h-4 w-4" aria-hidden="true" />{t('song.addArrangement')}</GroupButton></div>
      <p className="text-sm text-muted">{t('song.arrangementsHint')}</p>
      <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface">
        {song.arrangements.map((item, index) => <button key={item.id} type="button" aria-pressed={arrangement?.id === item.id} onClick={() => onSelectArrangement(item.id)} className={cn('flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-primary', arrangement?.id === item.id && 'bg-primary/10')}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/12 font-semibold text-primary-ink">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.label}</span><span className="block text-sm text-muted">{item.key || '—'}{item.bpm > 0 ? ` · ${item.bpm} BPM` : ''}</span></span>{arrangement?.id === item.id ? <GroupChip tone="success">{t('roles.selected')}</GroupChip> : <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />}</button>)}
        {song.arrangements.length === 0 ? <div className="p-4"><p className="font-medium">{t('song.noArrangementsTitle')}</p><p className="mt-1 text-sm text-muted">{t('song.noArrangementsBody')}</p><GroupButton className="mt-3" size="sm" onClick={onAddArrangement}>{t('song.addArrangement')}</GroupButton></div> : null}
      </div>
    </section>
  )

  const contentTabs = (
    <div className="space-y-4">
      {song.arrangements.length > 1 ? <GroupSelect label={t('song.arrangementPicker')} value={arrangement?.id ?? ''} onChange={onSelectArrangement} options={song.arrangements.map((item) => ({ value: item.id, label: item.label, description: `${item.key || '—'}${item.bpm > 0 ? ` · ${item.bpm} BPM` : ''}` }))} /> : null}
      <div role="tablist" aria-label={t('song.tabsLabel')} className="grid grid-cols-2 gap-1 rounded-xl bg-surface-hover p-1 sm:grid-cols-4">
        {SONG_TABS.map((tab) => <button key={tab} id={`prototype-song-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`prototype-song-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)} className={cn('min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary', activeTab === tab ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{tabCopy[tab]}</button>)}
      </div>
      <div role="tabpanel" id={`prototype-song-panel-${activeTab}`} aria-labelledby={`prototype-song-tab-${activeTab}`} className="min-h-56 rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7">
        {!arrangement ? <p className="text-sm text-muted">{t('song.noArrangementForTabs')}</p> : activeTab === 'lyrics' ? <p className="whitespace-pre-line text-base leading-8">{arrangement.lyrics || t('song.noLyrics')}</p> : activeTab === 'chords' ? <pre className="whitespace-pre-wrap font-sans text-sm leading-8 text-ink">{arrangement.chords || t('song.noChords')}</pre> : activeTab === 'notes' ? <p className="whitespace-pre-line text-sm leading-7">{arrangement.notes || t('song.noNotes')}</p> : <ResourceList resources={arrangement.resources} t={t} onPlay={onPlay} isPlaying={isPlaying} />}
      </div>
      {song.arrangements.length > 0 ? <GroupButton variant="secondary" onClick={onEditArrangement}><Pencil className="h-4 w-4" aria-hidden="true" />{t('song.editArrangementContent')}</GroupButton> : null}
    </div>
  )

  const pageHeader = (
    <div className="flex flex-col gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <GroupButton variant="ghost" size="icon" aria-label={t('songs.pageTitle')} onClick={onBack}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></GroupButton>
        <div className="min-w-0">
          <p className="text-sm text-muted">{t('songs.pageTitle')}</p>
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{song.title}</h1>
          <p className="mt-1 text-sm text-muted">{song.attribution || t('songs.unknownAttribution')}</p>
          <div className="mt-2 flex flex-wrap gap-2">{song.genre ? <GroupChip tone="accent">{song.genre}</GroupChip> : null}<GroupChip>{t(song.origin === 'cover' ? 'song.originCover' : song.origin === 'other' ? 'song.originOther' : 'song.originOriginal')}</GroupChip>{song.tags.map((tag) => <GroupChip key={tag}>{tag}</GroupChip>)}</div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-12 sm:pl-0">
        <button type="button" aria-label={song.favorite ? t('songs.removeFavorite', { title: song.title }) : t('songs.addFavorite', { title: song.title })} aria-pressed={song.favorite} onClick={() => onToggleFavorite(song.id)} className="grid h-11 w-11 place-items-center rounded-xl border border-border-subtle text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"><Heart className="h-4 w-4" fill={song.favorite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
        {arrangement ? <GroupButton onClick={onPractice}><Play className="h-4 w-4" aria-hidden="true" />{t('song.practiceArrangement')}</GroupButton> : null}
        <GroupButton variant="secondary" onClick={onEditSong}><Pencil className="h-4 w-4" aria-hidden="true" />{t('song.editSong')}</GroupButton>
      </div>
    </div>
  )

  return (
    <section className="space-y-6" aria-labelledby="prototype-song-title">
      {variant === 'workspace' ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(17rem,0.75fr)_minmax(0,1.8fr)]">
          <aside className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-4">
            <GroupButton variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('songs.pageTitle')}</GroupButton>
            {arrangementList}
            <SongFacts song={song} t={t} />
          </aside>
          <div className="min-w-0 space-y-5">
            {pageHeader}
            {contentTabs}
          </div>
        </div>
      ) : variant === 'guided' ? (
        <>
          {pageHeader}
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.72fr)]">
            <div className="min-w-0 space-y-5">{contentTabs}</div>
            <aside className="space-y-5">{arrangementList}<SongFacts song={song} t={t} /></aside>
          </div>
          <section className="rounded-2xl border border-error/30 bg-error/5 p-5" aria-labelledby="prototype-danger-zone">
            <h2 id="prototype-danger-zone" className="font-semibold text-error-ink">{t('common.dangerZone')}</h2>
            <p className="mt-1 text-sm text-muted">{t('song.deleteZoneHint')}</p>
            <GroupButton className="mt-3" variant="danger" onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('song.deleteSong')}</GroupButton>
          </section>
        </>
      ) : (
        <>
          {pageHeader}
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.62fr)]">
            <section className="min-w-0">{contentTabs}</section>
            <aside className="space-y-5">{arrangementList}<SongFacts song={song} t={t} />
              <details className="rounded-xl border border-border-subtle bg-surface p-4">
                <summary className="min-h-8 cursor-pointer font-semibold">{t('song.infoTitle')}</summary>
                <p className="mt-3 text-sm text-muted">{t('song.rightsLabel')}: {song.genre ? '—' : '—'}</p>
              </details>
            </aside>
          </div>
          <section className="rounded-2xl border border-error/30 bg-error/5 p-5" aria-labelledby="prototype-danger-zone">
            <h2 id="prototype-danger-zone" className="font-semibold text-error-ink">{t('common.dangerZone')}</h2>
            <GroupButton className="mt-3" variant="danger" onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden="true" />{t('song.deleteSong')}</GroupButton>
          </section>
        </>
      )}
    </section>
  )
}

function ResourceList({ resources, t, onPlay, isPlaying }: { resources: Arrangement['resources']; t: TFunction; onPlay: () => void; isPlaying: boolean }) {
  if (resources.length === 0) return <p className="text-sm text-muted">{t('song.noRelatedFiles')}</p>
  return (
    <ul className="divide-y divide-border-subtle">
      {resources.map((resource) => <li key={resource.id} className="flex min-h-14 items-center gap-3 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary-ink"><FileText className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1 truncate font-medium">{resource.label}</span>{resource.purpose === 'audio' ? <GroupButton variant="secondary" size="sm" onClick={onPlay}><Play className="h-4 w-4" aria-hidden="true" />{isPlaying ? t('player.pause') : t('player.play')}</GroupButton> : <GroupButton variant="secondary" size="sm" onClick={() => undefined}>{t('arrangement.download')}</GroupButton>}</li>)}
    </ul>
  )
}

function SongFacts({ song, t }: { song: Song; t: TFunction }) {
  return (
    <section className="space-y-3 border-t border-border-subtle pt-4" aria-labelledby="prototype-facts-title">
      <h2 id="prototype-facts-title" className="text-xs font-semibold uppercase tracking-wide text-muted">{t('song.infoTitle')}</h2>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {song.genre ? <div><dt className="text-muted">{t('arrangement.genreLabel')}</dt><dd className="mt-0.5 font-medium">{song.genre}</dd></div> : null}
        <div><dt className="text-muted">{t('song.attributionLabel')}</dt><dd className="mt-0.5 font-medium">{song.attribution}</dd></div>
      </dl>
    </section>
  )
}

function SongEditScreen({ song, draft, setDraft, onSave, onCancel, originOptions, t }: { song: Song; draft: SongDraft; setDraft: (draft: SongDraft) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; originOptions: { value: string; label: string }[]; t: TFunction }) {
  return (
    <section className="mx-auto max-w-3xl space-y-5" aria-labelledby="prototype-song-edit-heading">
      <div className="flex items-center gap-3"><GroupButton variant="ghost" size="icon" aria-label={t('song.cancel')} onClick={onCancel}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></GroupButton><div><p className="text-sm text-muted">{song.title}</p><h1 id="prototype-song-edit-heading" className="text-2xl font-bold">{t('song.editSong')}</h1></div></div>
      <form className="space-y-5" onSubmit={onSave}>
        <GroupCard className="space-y-4 p-5 sm:p-6">
          <GroupInput label={t('songCreate.titleLabel')} required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <GroupSelect label={t('song.originLabel')} value={draft.origin} onChange={(value) => setDraft({ ...draft, origin: value as Song['origin'] })} options={originOptions} />
            <GroupInput label={t('songCreate.wizardArtist')} value={draft.attribution} onChange={(event) => setDraft({ ...draft, attribution: event.target.value })} />
            <GroupInput label={t('songCreate.wizardGenre')} value={draft.genre} onChange={(event) => setDraft({ ...draft, genre: event.target.value })} />
            <GroupInput label={t('songs.tagsLabel')} value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
          </div>
          <details className="rounded-xl border border-border-subtle p-4" open>
            <summary className="cursor-pointer font-semibold">{t('song.infoTitle')}</summary>
            <GroupTextArea className="mt-3" label={t('song.rightsLabel')} value={draft.rights} onChange={(event) => setDraft({ ...draft, rights: event.target.value })} />
          </details>
        </GroupCard>
        <div className="flex flex-wrap justify-end gap-2"><GroupButton type="button" variant="secondary" onClick={onCancel}>{t('song.cancel')}</GroupButton><GroupButton type="submit"><Check className="h-4 w-4" aria-hidden="true" />{t('song.save')}</GroupButton></div>
      </form>
    </section>
  )
}

function ArrangementEditScreen(props: {
  song: Song
  arrangement: Arrangement | undefined
  isCreatingArrangement: boolean
  mode: 'lyrics' | 'chords' | 'timing'
  setMode: (mode: 'lyrics' | 'chords' | 'timing') => void
  label: string
  setLabel: (value: string) => void
  keyValue: string
  setKeyValue: (value: string) => void
  bpm: string
  setBpm: (value: string) => void
  lyrics: string
  setLyrics: (value: string) => void
  chords: string
  setChords: (value: string) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  onPractice: () => void
  t: TFunction
}) {
  const { song, arrangement, isCreatingArrangement, mode, setMode, label, setLabel, keyValue, setKeyValue, bpm, setBpm, lyrics, setLyrics, chords, setChords, onSave, onCancel, onPractice, t } = props
  const modes = [
    { id: 'lyrics' as const, label: t('arrangement.editorStepLyrics') },
    { id: 'chords' as const, label: t('arrangement.editorStepChords') },
    { id: 'timing' as const, label: t('arrangement.editorStepTiming') },
  ]
  return (
    <section className="mx-auto max-w-5xl space-y-5" aria-labelledby="prototype-arrangement-edit-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><GroupButton variant="ghost" size="icon" aria-label={t('song.cancel')} onClick={onCancel}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></GroupButton><div><p className="text-sm text-muted">{song.title}</p><h1 id="prototype-arrangement-edit-heading" className="text-2xl font-bold">{t(isCreatingArrangement ? 'song.addArrangement' : 'arrangement.visualEditorTitle')}</h1></div></div>
        {!isCreatingArrangement ? <GroupButton variant="secondary" onClick={onPractice}><Play className="h-4 w-4" aria-hidden="true" />{t('song.practiceArrangement')}</GroupButton> : null}
      </div>
      <form className="space-y-5" onSubmit={onSave}>
        <GroupCard className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)_minmax(9rem,0.45fr)]">
          <GroupInput label={t('arrangement.labelLabel')} value={label} onChange={(event) => setLabel(event.target.value)} />
          <GroupInput label={t('arrangement.keyOptional')} value={keyValue} onChange={(event) => setKeyValue(event.target.value)} />
          <GroupInput label={t('arrangement.bpmLabel')} type="number" min={1} max={400} value={bpm} onChange={(event) => setBpm(event.target.value)} />
        </GroupCard>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('arrangement.editorModeLabel')}>
          {modes.map((item) => <GroupButton key={item.id} variant={mode === item.id ? 'primary' : 'secondary'} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</GroupButton>)}
        </div>
        {mode === 'lyrics' ? <GroupTextArea className="min-h-72 font-sans leading-7" label={t('arrangement.lyricsOptional')} hint={t('arrangement.visualLyricsHelp')} value={lyrics} onChange={(event) => setLyrics(event.target.value)} /> : mode === 'chords' ? <div className="space-y-3"><GroupTextArea className="min-h-72 font-mono leading-7" label={t('arrangement.chordsLabel')} hint={t('arrangement.chordsHint')} value={chords} onChange={(event) => setChords(event.target.value)} /><details className="rounded-xl border border-border-subtle bg-surface p-4"><summary className="cursor-pointer font-semibold">{t('arrangement.advancedToolsTitle')}</summary><div className="mt-4 flex flex-wrap gap-2"><GroupButton variant="secondary" type="button" onClick={() => undefined}>{t('arrangement.importChordSource')}</GroupButton><GroupButton variant="secondary" type="button" onClick={() => undefined}>{t('arrangement.exportChordPro')}</GroupButton></div></details></div> : <TimingEditor keyValue={keyValue} bpm={bpm} t={t} />}
        <div className="flex flex-wrap justify-between gap-2"><GroupButton type="button" variant="secondary" onClick={onCancel}>{t('song.cancel')}</GroupButton><GroupButton type="submit"><Check className="h-4 w-4" aria-hidden="true" />{t('arrangement.save')}</GroupButton></div>
      </form>
      {arrangement ? <p className="text-sm text-muted">{t('arrangement.visualEditorHint')} · {arrangement.resources.length} {t('song.tabFiles')}</p> : null}
    </section>
  )
}

function TimingEditor({ keyValue, bpm, t }: { keyValue: string; bpm: string; t: TFunction }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-5" aria-labelledby="prototype-timing-heading">
      <div><h2 id="prototype-timing-heading" className="font-semibold">{t('arrangement.editorStepTiming')}</h2><p className="mt-1 text-sm text-muted">{t('arrangement.visualEditorHint')}</p></div>
      <div className="flex flex-wrap items-center gap-3"><GroupChip tone="accent">{keyValue || t('song.noKeyTempo')}</GroupChip><GroupChip>{bpm || '—'} BPM</GroupChip><GroupButton type="button" variant="secondary" onClick={() => undefined}><Play className="h-4 w-4" aria-hidden="true" />{t('practice.referenceTitle')}</GroupButton></div>
      <div className="space-y-2" aria-label={t('arrangement.songSheetTitle')}>
        {['Caminamos juntos', 'con una misma voz', 'Hoy comienza el canto'].map((line, index) => <div key={line} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-hover px-3"><span className="w-8 text-xs tabular-nums text-muted">{`0:${String(index * 8).padStart(2, '0')}`}</span><span className="rounded-md bg-primary/12 px-2 py-1 text-xs font-semibold text-primary-ink">{index === 1 ? 'Em' : 'G'}</span><span>{line}</span></div>)}
      </div>
    </section>
  )
}

function PracticeScreen(props: {
  song: Song
  arrangement: Arrangement | undefined
  activeTab: PracticeTab
  setActiveTab: (tab: PracticeTab) => void
  onTabKeyDown: (event: KeyboardEvent<HTMLButtonElement>, tab: PracticeTab) => void
  semitones: number
  setSemitones: (value: number) => void
  metronomeOn: boolean
  setMetronomeOn: (value: boolean) => void
  tunerOn: boolean
  setTunerOn: (value: boolean) => void
  followLyrics: boolean
  setFollowLyrics: (value: boolean) => void
  isPlaying: boolean
  setIsPlaying: (value: boolean) => void
  practiceView: 'singer' | 'guitarist'
  setPracticeView: (value: 'singer' | 'guitarist') => void
  exercise: number
  setExercise: (value: number) => void
  onBack: () => void
  onEditArrangement: () => void
  t: TFunction
}) {
  const { song, arrangement, activeTab, setActiveTab, onTabKeyDown, semitones, setSemitones, metronomeOn, setMetronomeOn, tunerOn, setTunerOn, followLyrics, setFollowLyrics, isPlaying, setIsPlaying, practiceView, setPracticeView, exercise, setExercise, onBack, onEditArrangement, t } = props
  const tabLabels: Record<PracticeTab, string> = { estudiar: t('practice.tabs.estudiar'), calentar: t('practice.tabs.calentar'), avanzado: t('practice.tabs.avanzado'), afinar: t('practice.tabs.afinar') }
  return (
    <section className="mx-auto max-w-5xl space-y-5" aria-labelledby="prototype-practice-heading">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-center gap-3"><GroupButton variant="ghost" size="icon" aria-label={t('song.cancel')} onClick={onBack}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></GroupButton><div><p className="text-sm text-muted">{song.title}</p><h1 id="prototype-practice-heading" className="text-2xl font-bold">{t('practice.kicker')}</h1><p className="mt-1 text-sm text-muted">{arrangement?.label ?? t('song.noArrangementsTitle')} · {arrangement?.key || t('practice.keyEmpty')} · {arrangement?.bpm || '—'} BPM</p></div></div>
        {arrangement ? <GroupButton variant="secondary" onClick={() => setIsPlaying(!isPlaying)}><Play className="h-4 w-4" aria-hidden="true" />{isPlaying ? t('player.pause') : t('player.play')}</GroupButton> : null}
      </div>
      {arrangement ? <div role="tablist" aria-label={t('practice.tabs.label')} className="grid grid-cols-2 gap-2 rounded-2xl border border-border-subtle bg-surface p-2 sm:grid-cols-4">
        {PRACTICE_TABS.map((tab) => <button key={tab} id={`prototype-practice-tab-${tab}`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`prototype-practice-panel-${tab}`} tabIndex={activeTab === tab ? 0 : -1} onClick={() => setActiveTab(tab)} onKeyDown={(event) => onTabKeyDown(event, tab)} className={cn('min-h-12 rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary', activeTab === tab ? 'bg-primary-strong text-primary-foreground' : 'text-muted hover:bg-surface-hover hover:text-ink')}>{tabLabels[tab]}</button>)}
      </div> : null}
      <div role="tabpanel" id={`prototype-practice-panel-${activeTab}`} aria-labelledby={`prototype-practice-tab-${activeTab}`} tabIndex={0} className="min-h-72">
        {activeTab === 'estudiar' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <section className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-7" aria-labelledby="prototype-practice-lyrics-title">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="prototype-practice-lyrics-title" className="font-semibold">{t('practice.lyricsTitle')}</h2><div className="flex gap-2"><GroupButton size="sm" variant={practiceView === 'singer' ? 'primary' : 'secondary'} onClick={() => setPracticeView('singer')}>{t('practice.viewSinger')}</GroupButton><GroupButton size="sm" variant={practiceView === 'guitarist' ? 'primary' : 'secondary'} onClick={() => setPracticeView('guitarist')}>{t('practice.viewGuitarist')}</GroupButton></div></div>
              <p className="mt-6 whitespace-pre-line text-lg leading-10">{arrangement?.lyrics || t('practice.noLyricsBody')}</p>
            </section>
            <aside className="space-y-4">
              <GroupCard className="space-y-4 p-4">
                <h2 className="font-semibold">{t('practice.toneViewTitle')}</h2>
                <div className="flex items-center justify-between gap-2"><GroupButton size="icon" variant="secondary" aria-label={t('practice.toneDown')} onClick={() => setSemitones(semitones - 1)}><ArrowDown className="h-4 w-4" aria-hidden="true" /></GroupButton><span className="text-center font-semibold tabular-nums">{semitones > 0 ? `+${semitones}` : semitones}</span><GroupButton size="icon" variant="secondary" aria-label={t('practice.toneUp')} onClick={() => setSemitones(semitones + 1)}><ArrowUp className="h-4 w-4" aria-hidden="true" /></GroupButton></div>
                <GroupButton variant="ghost" size="sm" onClick={() => setSemitones(0)}>{t('practice.toneReset')}</GroupButton>
              </GroupCard>
              <GroupButton variant={followLyrics ? 'primary' : 'secondary'} block aria-pressed={followLyrics} onClick={() => setFollowLyrics(!followLyrics)}>{t('practice.followLyrics')}</GroupButton>
              <GroupButton variant={metronomeOn ? 'primary' : 'secondary'} block aria-pressed={metronomeOn} onClick={() => setMetronomeOn(!metronomeOn)}>{metronomeOn ? t('practice.metronomeStop') : t('practice.metronomeStart')}</GroupButton>
            </aside>
          </div>
        ) : activeTab === 'calentar' ? (
          <GroupCard className="mx-auto max-w-2xl space-y-5 p-5 sm:p-7">
            <div><h2 className="text-xl font-bold">{t('practice.warmup.title')}</h2><p className="mt-1 text-sm text-muted">{t('practice.warmup.summary')}</p></div>
            <p className="text-sm text-muted">{t('practice.warmup.duration')}</p>
            <div className="rounded-xl bg-surface-hover p-4"><p className="text-sm text-muted">{t('practice.warmup.step', { current: exercise, total: 3 })}</p><h3 className="mt-2 font-semibold">{t(exercise === 1 ? 'practice.warmup.voice.stepOneTitle' : exercise === 2 ? 'practice.warmup.voice.stepTwoTitle' : 'practice.warmup.voice.stepThreeTitle')}</h3><p className="mt-1 text-sm text-muted">{t(exercise === 1 ? 'practice.warmup.voice.stepOne' : exercise === 2 ? 'practice.warmup.voice.stepTwo' : 'practice.warmup.voice.stepThree')}</p></div>
            <div className="flex flex-wrap gap-2"><GroupButton onClick={() => setExercise(exercise >= 3 ? 1 : exercise + 1)}>{t(exercise >= 3 ? 'practice.warmup.restart' : 'practice.warmup.next')}</GroupButton><GroupButton variant="secondary" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? t('practice.warmup.pause') : t('practice.warmup.start')}</GroupButton></div>
          </GroupCard>
        ) : activeTab === 'avanzado' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <GroupCard className="space-y-3 p-5"><h2 className="font-semibold">{t('practice.avanzado.title')}</h2><p className="text-sm text-muted">{t('practice.avanzado.hint')}</p><GroupButton variant="secondary" onClick={onEditArrangement}>{t('practice.avanzado.timingLink')}</GroupButton></GroupCard>
            <GroupCard className="space-y-3 p-5"><h2 className="font-semibold">{t('practice.metronomeTitle')}</h2><p className="text-sm text-muted">{t('arrangement.bpmLabel')}: {arrangement?.bpm || '—'}</p><GroupButton variant={metronomeOn ? 'primary' : 'secondary'} aria-pressed={metronomeOn} onClick={() => setMetronomeOn(!metronomeOn)}>{metronomeOn ? t('practice.metronomeStop') : t('practice.metronomeStart')}</GroupButton></GroupCard>
          </div>
        ) : (
          <GroupCard className="mx-auto max-w-xl space-y-4 p-5 sm:p-7">
            <div><h2 className="text-xl font-bold">{t('practice.afinar.title')}</h2><p className="mt-1 text-sm text-muted">{t('practice.afinar.hint')}</p></div>
            <div className="flex h-28 items-center justify-center rounded-xl bg-surface-hover"><span className="text-4xl font-bold tracking-tight text-primary-ink" aria-live="polite">{tunerOn ? 'La' : '—'}</span></div>
            <GroupButton variant={tunerOn ? 'primary' : 'secondary'} aria-pressed={tunerOn} onClick={() => setTunerOn(!tunerOn)}>{tunerOn ? t('common.close') : t('practice.tuner.open')}</GroupButton>
          </GroupCard>
        )}
      </div>
    </section>
  )
}

function CreateSongDialog(props: {
  open: boolean
  draft: SongDraft
  setDraft: (value: SongDraft) => void
  versions: NewVersion[]
  setVersions: (value: NewVersion[] | ((current: NewVersion[]) => NewVersion[])) => void
  optionalOpen: boolean
  setOptionalOpen: (value: boolean) => void
  expandedVersionIds: string[]
  toggleVersionDetails: (id: string) => void
  originOptions: { value: string; label: string }[]
  onClose: () => void
  onAddVersion: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  t: TFunction
}) {
  const { open, draft, setDraft, versions, setVersions, optionalOpen, setOptionalOpen, expandedVersionIds, toggleVersionDetails, originOptions, onClose, onAddVersion, onSubmit, t } = props
  return (
    <GroupDialog open={open} onClose={onClose} title={t('songCreate.createTitle')} description={t('songCreate.wizardArrangeHint')} size="lg" mobileFullscreen footer={(close) => <div className="flex flex-wrap justify-between gap-2"><GroupButton type="button" variant="secondary" onClick={close}>{t('songCreate.cancel')}</GroupButton><GroupButton type="submit" form="prototype-create-song-form" disabled={!draft.title.trim()}><Check className="h-4 w-4" aria-hidden="true" />{t('songCreate.create')}</GroupButton></div>}>
      <form id="prototype-create-song-form" className="space-y-5" onSubmit={onSubmit}>
        <GroupInput label={t('songCreate.titleLabel')} required data-autofocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <GroupSelect label={t('songCreate.originLabel')} value={draft.origin} onChange={(value) => setDraft({ ...draft, origin: value as Song['origin'] })} options={originOptions} />
        <button type="button" aria-expanded={optionalOpen} onClick={() => setOptionalOpen(!optionalOpen)} className="flex min-h-11 w-full items-center justify-between border-b border-border-subtle py-2 text-left font-semibold text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"><span>{t(optionalOpen ? 'songCreate.wizardHideDetails' : 'songCreate.wizardMoreDetails')}</span><ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', optionalOpen && 'rotate-180')} aria-hidden="true" /></button>
        {optionalOpen ? <div className="grid gap-4 sm:grid-cols-2"><GroupInput label={t('songCreate.wizardArtist')} value={draft.attribution} onChange={(event) => setDraft({ ...draft, attribution: event.target.value })} /><GroupInput label={t('songCreate.wizardGenre')} value={draft.genre} onChange={(event) => setDraft({ ...draft, genre: event.target.value })} /><GroupInput label={t('songCreate.tagsLabel')} value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /><GroupTextArea label={t('song.rightsLabel')} value={draft.rights} onChange={(event) => setDraft({ ...draft, rights: event.target.value })} /></div> : null}
        <section className="space-y-3 border-t border-border-subtle pt-4" aria-labelledby="prototype-create-versions-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="prototype-create-versions-title" className="font-semibold">{t('songCreate.wizardVersionsTitle')}</h3><p className="mt-1 text-sm text-muted">{t('songCreate.wizardVersionsHint')}</p></div><GroupButton type="button" size="sm" variant="secondary" onClick={onAddVersion}><Plus className="h-4 w-4" aria-hidden="true" />{t('songCreate.wizardAddVersion')}</GroupButton></div>
          {versions.map((version, index) => (
            <div key={version.id} className="space-y-3 border-b border-border-subtle py-3 last:border-b-0" data-testid={`prototype-new-version-${index + 1}`}>
              <div className="flex items-center justify-between gap-3"><h4 className="font-medium">{index === 0 ? t('songCreate.wizardArrangeTitle') : t('songCreate.wizardVersionNumber', { number: index + 1 })}</h4>{index > 0 ? <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-primary" aria-label={t('songCreate.wizardRemove')} onClick={() => setVersions((current) => current.filter((item) => item.id !== version.id))}><X className="h-4 w-4" aria-hidden="true" /></button> : null}</div>
              <GroupInput label={t('songCreate.wizardArrangementLabel')} placeholder={index > 0 ? t(index === 1 ? 'songCreate.wizardVersionBaritone' : 'songCreate.wizardVersionSoprano') : t('songCreate.wizardDefaultArrangement')} value={version.name} onChange={(event) => setVersions((current) => current.map((item) => item.id === version.id ? { ...item, name: event.target.value } : item))} />
              <button type="button" aria-expanded={expandedVersionIds.includes(version.id)} onClick={() => toggleVersionDetails(version.id)} className="flex min-h-10 items-center gap-2 text-sm font-medium text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"><ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', expandedVersionIds.includes(version.id) && 'rotate-180')} aria-hidden="true" />{t(expandedVersionIds.includes(version.id) ? 'song.hideVersionDetails' : 'song.showVersionDetails')}</button>
              {expandedVersionIds.includes(version.id) ? <div className="grid gap-3 sm:grid-cols-2"><GroupInput label={t('songCreate.wizardKey')} value={version.key} onChange={(event) => setVersions((current) => current.map((item) => item.id === version.id ? { ...item, key: event.target.value } : item))} /><GroupInput label={t('songCreate.wizardBpm')} type="number" min={1} max={400} value={version.bpm} onChange={(event) => setVersions((current) => current.map((item) => item.id === version.id ? { ...item, bpm: event.target.value } : item))} /><label className="space-y-1.5 text-sm font-medium text-ink sm:col-span-2"><span>{t('songCreate.wizardVersionAudio')}</span><input type="file" accept="audio/*,.mp3,.wav,.flac,.m4a" className="block min-h-11 w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:font-semibold file:text-primary-ink focus-visible:outline-2 focus-visible:outline-primary" onChange={(event) => setVersions((current) => current.map((item) => item.id === version.id ? { ...item, audioName: event.target.files?.[0]?.name ?? '' } : item))} /></label></div> : null}
            </div>
          ))}
          {versions.length === 0 ? <p className="text-sm text-muted">{t('songCreate.wizardReviewNoArrangement')}</p> : null}
        </section>
      </form>
    </GroupDialog>
  )
}

export const SONG_PROTOTYPE_VARIANTS = ['guided', 'workspace', 'catalog'] as const
