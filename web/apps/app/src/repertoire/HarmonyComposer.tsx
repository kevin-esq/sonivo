'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Minus, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useT } from '../i18n'
import { Button } from '../ui/button'
import {
  barDurationTicks,
  HARMONY_SCALES,
  harmonyChordsForScale,
  normalizeKeySignature,
  parseHarmonyProgression,
  serializeHarmonyProgression,
  type HarmonyProgression,
} from './harmonyProgression'
import { playHarmonyProgression } from './harmonyAudio'
import { HarmonyPianoKeyboard } from './HarmonyPianoKeyboard'

const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const METERS = [[4, 4], [3, 4], [2, 4], [6, 8], [7, 8], [12, 8]]
const DURATIONS = [16, 12, 8, 6, 4, 2, 1]
const PROGRESSION_PRESETS = [
  { id: '1564', degrees: [1, 5, 6, 4] },
  { id: '6415', degrees: [6, 4, 1, 5] },
  { id: '1451', degrees: [1, 4, 5, 1] },
  { id: '2511', degrees: [2, 5, 1, 1] },
  { id: '1625', degrees: [1, 6, 2, 5] },
  { id: '6251', degrees: [6, 2, 5, 1] },
]
const ID = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`

export function HarmonyComposer({
  value,
  keySignature,
  bpm,
  onChange,
  onKeyChange,
  onBpmChange,
  onBack,
}: {
  value: string | null
  keySignature: string
  bpm: number | null
  onChange: (value: string) => void
  onKeyChange: (value: string) => void
  onBpmChange: (value: number) => void
  onBack: () => void
}) {
  const { t } = useT()
  const [progression, setProgression] = useState<HarmonyProgression>(() => parseHarmonyProgression(value, t('harmony.defaultSection')))
  const lastSerialized = useRef(serializeHarmonyProgression(progression))
  const [activeSectionId, setActiveSectionId] = useState(() => progression.sections[0]?.id ?? '')
  const [durationTicks, setDurationTicks] = useState(4)
  const [playing, setPlaying] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const activeSection = progression.sections.find(section => section.id === activeSectionId) ?? progression.sections[0]
  const chordOptions = useMemo(() => harmonyChordsForScale(keySignature || 'C', progression.scale), [keySignature, progression.scale])
  const previewChord = activeSection?.bars.flat().at(-1)?.chord ?? chordOptions[0]?.chord ?? 'C'
  const barTicks = barDurationTicks(progression.meter)

  useEffect(() => {
    const serialized = serializeHarmonyProgression(progression)
    if (serialized === lastSerialized.current) return
    lastSerialized.current = serialized
    onChange(serialized)
  }, [onChange, progression])

  useEffect(() => () => stopRef.current?.(), [])

  function update(change: (current: HarmonyProgression) => HarmonyProgression) {
    setProgression(current => change(current))
  }

  function updateSection(sectionId: string, change: (section: HarmonyProgression['sections'][number]) => HarmonyProgression['sections'][number]) {
    update(current => ({ ...current, sections: current.sections.map(section => section.id === sectionId ? change(section) : section) }))
  }

  function addBar() {
    if (!activeSection || activeSection.bars.length >= 64) return
    updateSection(activeSection.id, section => ({ ...section, bars: [...section.bars, []] }))
  }

  function addChord(chord: string, barIndex: number) {
    if (!activeSection) return
    updateSection(activeSection.id, section => {
      const bars = section.bars.map(bar => [...bar])
      const bar = bars[barIndex] ?? []
      const used = bar.reduce((total, slot) => total + slot.durationTicks, 0)
      const remaining = barTicks - used
      if (remaining <= 0) return section
      bar.push({ chord, durationTicks: Math.min(durationTicks, remaining) })
      bars[barIndex] = bar
      return { ...section, bars }
    })
  }

  function removeChord(barIndex: number, slotIndex: number) {
    if (!activeSection) return
    updateSection(activeSection.id, section => ({ ...section, bars: section.bars.map((bar, index) => index === barIndex ? bar.filter((_, itemIndex) => itemIndex !== slotIndex) : bar) }))
  }

  function setChordDuration(barIndex: number, slotIndex: number, nextDuration: number) {
    if (!activeSection) return
    updateSection(activeSection.id, section => ({
      ...section,
      bars: section.bars.map((bar, index) => {
        if (index !== barIndex) return bar
        const otherTicks = bar.reduce((total, slot, itemIndex) => total + (itemIndex === slotIndex ? 0 : slot.durationTicks), 0)
        return bar.map((slot, itemIndex) => itemIndex === slotIndex ? { ...slot, durationTicks: Math.min(nextDuration, Math.max(1, barTicks - otherTicks)) } : slot)
      }),
    }))
  }

  function addSection() {
    if (progression.sections.length >= 32) return
    const section = { id: ID(), name: t('harmony.sectionName'), bars: Array.from({ length: 4 }, () => []) }
    update(current => ({ ...current, sections: [...current.sections, section] }))
    setActiveSectionId(section.id)
  }

  function removeSection() {
    if (!activeSection || progression.sections.length < 2) return
    const remaining = progression.sections.filter(section => section.id !== activeSection.id)
    update(current => ({ ...current, sections: remaining }))
    setActiveSectionId(remaining[0]!.id)
  }

  function applyPreset(degrees: number[]) {
    if (!activeSection) return
    const bars = degrees.map(degree => {
      const option = chordOptions[degree - 1]
      return option ? [{ chord: option.chord, durationTicks: barTicks }] : []
    })
    if (bars.some(bar => !bar.length)) return
    updateSection(activeSection.id, section => ({ ...section, bars }))
    setLibraryOpen(false)
  }

  async function togglePlayback() {
    if (stopRef.current) {
      stopRef.current()
      stopRef.current = null
      setPlaying(false)
      return
    }
    if (!progression.sections.some(section => section.bars.some(bar => bar.length))) return
    try {
      setPlaying(true)
      stopRef.current = await playHarmonyProgression(progression, keySignature || 'C', bpm ?? 120, () => {
        stopRef.current = null
        setPlaying(false)
      })
    } catch {
      stopRef.current = null
      setPlaying(false)
    }
  }

  return (
    <section className="flex min-h-dvh w-full flex-col overflow-hidden bg-canvas text-ink" data-testid="harmony-composer">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-surface px-4 py-2 lg:px-6">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="mr-2 size-4" />{t('harmony.back')}
        </Button>
        <span className="hidden h-7 w-px bg-border-subtle sm:block" />
        <span className="font-semibold tracking-wide">Sonivo</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="harmony-key">{t('harmony.key')}</label>
          <select id="harmony-key" className="h-10 rounded-lg border border-border-subtle bg-surface-hover px-3 text-sm" value={normalizeKeySignature(keySignature)} onChange={event => onKeyChange(event.target.value)}>
            {KEYS.map(key => <option key={key} value={key}>{key}</option>)}
          </select>
          <label className="sr-only" htmlFor="harmony-scale">{t('harmony.scale')}</label>
          <select id="harmony-scale" className="h-10 max-w-44 rounded-lg border border-border-subtle bg-surface-hover px-3 text-sm" value={progression.scale} onChange={event => update(current => ({ ...current, scale: event.target.value }))}>
            {HARMONY_SCALES.map(scale => <option key={scale} value={scale}>{t(`harmony.scale.${scale}` as never)}</option>)}
          </select>
          <label className="sr-only" htmlFor="harmony-meter">{t('harmony.meter')}</label>
          <select id="harmony-meter" className="h-10 rounded-lg border border-border-subtle bg-surface-hover px-3 text-sm" value={`${progression.meter.numerator}/${progression.meter.denominator}`} onChange={event => {
            const [numerator, denominator] = event.target.value.split('/').map(Number)
            const meter = { numerator: numerator!, denominator: denominator! }
            const nextBarTicks = barDurationTicks(meter)
            update(current => ({
              ...current,
              meter,
              sections: current.sections.map(section => ({
                ...section,
                bars: section.bars.map(bar => {
                  let remaining = nextBarTicks
                  return bar.flatMap(slot => {
                    if (remaining <= 0) return []
                    const duration = Math.min(slot.durationTicks, remaining)
                    remaining -= duration
                    return [{ ...slot, durationTicks: duration }]
                  })
                }),
              })),
            }))
          }}>
            {METERS.map(([numerator, denominator]) => <option key={`${numerator}/${denominator}`} value={`${numerator}/${denominator}`}>{numerator}/{denominator}</option>)}
          </select>
          <label className="sr-only" htmlFor="harmony-bpm">{t('harmony.tempo')}</label>
          <div className="flex h-10 items-center gap-2 rounded-lg border border-border-subtle bg-surface-hover px-3">
            <input id="harmony-bpm" type="number" min={1} max={400} className="w-14 bg-transparent text-center text-sm text-ink outline-none" value={bpm ?? 120} onChange={event => {
              const next = Number(event.target.value)
              if (Number.isInteger(next) && next >= 1 && next <= 400) onBpmChange(next)
            }} />
            <span className="text-xs text-muted">BPM</span>
          </div>
          <label className="sr-only" htmlFor="harmony-genre">{t('harmony.genre')}</label>
          <select id="harmony-genre" className="h-10 rounded-lg border border-border-subtle bg-surface-hover px-3 text-sm" value={progression.genre} onChange={event => update(current => ({ ...current, genre: event.target.value }))}>
            {['pop', 'rock', 'jazz', 'blues', 'edm', 'funk', 'reggae', 'latin', 'country', 'rnb'].map(genre => <option key={genre} value={genre}>{t(`harmony.genre.${genre}` as never)}</option>)}
          </select>
          <Button type="button" variant="secondary" size="sm" onClick={() => void togglePlayback()} disabled={!progression.sections.some(section => section.bars.some(bar => bar.length))}>
            {playing ? <Pause aria-hidden="true" className="mr-2 size-4" /> : <Play aria-hidden="true" className="mr-2 size-4" />}
            {playing ? t('harmony.stop') : t('harmony.play')}
          </Button>
          <Button type="button" variant="secondary" size="sm" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(open => !open)}>{t('harmony.progressionLibrary')}</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {libraryOpen ? <section className="grid shrink-0 gap-2 border-b border-border-subtle bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('harmony.progressionLibrary')}>
          {PROGRESSION_PRESETS.map(preset => <button key={preset.id} type="button" className="min-h-14 rounded-lg border border-border-subtle bg-surface-hover px-4 py-3 text-left hover:border-primary hover:bg-surface-hover" onClick={() => applyPreset(preset.degrees)}>
            <span className="block text-sm font-semibold">{t(`harmony.progression.${preset.id}` as never)}</span>
            <span className="mt-1 block font-mono text-xs text-ink/55">{preset.degrees.map(degree => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][degree - 1]).join(' · ')}</span>
          </button>)}
        </section> : null}
        <nav aria-label={t('harmony.sections')} className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border-subtle bg-surface px-4 py-3 lg:px-6">
          {progression.sections.map(section => <button key={section.id} type="button" onClick={() => setActiveSectionId(section.id)} className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-semibold ${section.id === activeSection?.id ? 'bg-primary text-primary-foreground' : 'bg-surface-hover text-muted hover:bg-primary/10'}`}>{section.name}</button>)}
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-ink hover:bg-primary/10" onClick={addSection} disabled={progression.sections.length >= 32}><Plus aria-hidden="true" className="mr-1 size-4" />{t('harmony.addSection')}</Button>
          {progression.sections.length > 1 ? <Button type="button" variant="ghost" size="sm" className="size-11 p-0 text-muted hover:bg-primary/10 hover:text-ink" aria-label={t('harmony.removeSection')} onClick={removeSection}><Trash2 aria-hidden="true" className="size-4" /></Button> : null}
          {activeSection ? <input aria-label={t('harmony.renameSection')} className="ml-auto h-10 w-36 rounded-lg border border-border-subtle bg-surface-hover px-3 text-sm" value={activeSection.name} maxLength={64} onChange={event => updateSection(activeSection.id, section => ({ ...section, name: event.target.value }))} onBlur={() => { if (!activeSection.name.trim()) updateSection(activeSection.id, section => ({ ...section, name: t('harmony.defaultSection') })) }} /> : null}
        </nav>

        <section className="space-y-5 p-4 lg:p-6" aria-label={t('harmony.progression')}>
          <HarmonyPianoKeyboard chord={previewChord} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-ink/65">
              <span>{t('harmony.duration')}</span>
              {DURATIONS.map(duration => <button key={duration} type="button" aria-pressed={durationTicks === duration} className={`min-h-10 min-w-10 rounded-md px-2 font-mono ${durationTicks === duration ? 'bg-primary text-primary-foreground' : 'bg-surface-hover hover:bg-primary/10'}`} onClick={() => setDurationTicks(duration)}>{duration === 16 ? '1/1' : duration === 12 ? '3/4' : duration === 8 ? '1/2' : duration === 6 ? '3/8' : duration === 4 ? '1/4' : duration === 2 ? '1/8' : '1/16'}</button>)}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => updateSection(activeSection!.id, section => ({ ...section, bars: section.bars.length > 1 ? section.bars.slice(0, -1) : section.bars }))} disabled={!activeSection || activeSection.bars.length <= 1}><Minus aria-hidden="true" className="mr-1 size-4" />{t('harmony.removeBar')}</Button>
              <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{activeSection?.bars.length ?? 0}</span>
              <Button type="button" variant="secondary" size="sm" onClick={addBar} disabled={(activeSection?.bars.length ?? 0) >= 64}><Plus aria-hidden="true" className="mr-1 size-4" />{t('harmony.addBar')}</Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {activeSection?.bars.map((bar, barIndex) => {
              const used = bar.reduce((total, slot) => total + slot.durationTicks, 0)
              const remaining = Math.max(0, barTicks - used)
              return <article key={`${activeSection.id}-${barIndex}`} className="min-h-52 rounded-xl border border-border-subtle bg-surface p-3 shadow-lg shadow-primary/5">
                <header className="mb-3 flex items-center justify-between border-b border-border-subtle pb-2">
                  <h2 className="text-sm font-bold">{t('harmony.bar', { number: barIndex + 1 })}</h2>
                  <span className="text-xs tabular-nums text-ink/45">{used}/{barTicks}</span>
                </header>
                <div className="mb-3 flex min-h-14 flex-wrap content-start gap-2">
                  {bar.map((slot, slotIndex) => <div key={`${slot.chord}-${slotIndex}`} className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1.5">
                    <span className="font-semibold text-primary-ink">{slot.chord}</span>
                    <select aria-label={t('harmony.chordDuration', { chord: slot.chord })} className="max-w-14 bg-transparent text-[10px] text-muted" value={slot.durationTicks} onChange={event => setChordDuration(barIndex, slotIndex, Number(event.target.value))}>
                      {DURATIONS.map(value => <option key={value} value={value} className="bg-surface-hover">{value === 16 ? '1/1' : value === 12 ? '3/4' : value === 8 ? '1/2' : value === 6 ? '3/8' : value === 4 ? '1/4' : value === 2 ? '1/8' : '1/16'}</option>)}
                    </select>
                    <button type="button" className="grid size-7 place-items-center rounded text-ink/45 hover:bg-primary/10 hover:text-ink" aria-label={t('harmony.removeChord', { chord: slot.chord })} onClick={() => removeChord(barIndex, slotIndex)}><Minus aria-hidden="true" className="size-3.5" /></button>
                  </div>)}
                  {!bar.length ? <p className="py-2 text-xs text-ink/40">{t('harmony.emptyBar')}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chordOptions.map(item => <button key={`${item.degree}-${item.chord}`} type="button" disabled={!remaining} onClick={() => addChord(item.chord, barIndex)} className="flex min-h-10 min-w-12 flex-col items-center justify-center rounded-md bg-surface-hover px-2 text-xs hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-35">
                    <span className="font-semibold">{item.chord}</span><span className="text-[10px] text-ink/45">{item.degree}</span>
                  </button>)}
                </div>
              </article>
            })}
          </div>
        </section>

        <section className="space-y-3 border-t border-border-subtle bg-surface-hover p-4 lg:p-6" aria-label={t('harmony.tracks')}>
          <h2 className="text-sm font-semibold text-ink">{t('harmony.tracks')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {progression.tracks.map(track => <div key={track.id} className="grid min-w-0 gap-3 rounded-xl border border-border-subtle bg-surface p-3">
              <div className="flex min-w-0 items-center gap-2">
                <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-primary/10" aria-label={t(`harmony.instrument.${track.instrument}` as never)}>
                  <input type="checkbox" className="size-4 accent-primary" checked={track.enabled} onChange={event => update(current => ({ ...current, tracks: current.tracks.map(item => item.id === track.id ? { ...item, enabled: event.target.checked } : item) }))} />
                </label>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t(`harmony.instrument.${track.instrument}` as never)}</span>
                <select aria-label={t('harmony.trackPattern')} className="w-28 shrink-0 rounded-lg border border-border-subtle bg-surface-hover px-2 py-2 text-xs" value={track.pattern} onChange={event => update(current => ({ ...current, tracks: current.tracks.map(item => item.id === track.id ? { ...item, pattern: event.target.value as typeof item.pattern } : item) }))}>
                {(['sustain', 'accompaniment', 'rhythm'] as const).map(pattern => <option key={pattern} value={pattern} className="bg-surface">{t(`harmony.pattern.${pattern}` as never)}</option>)}
                </select>
              </div>
              <input type="range" min={0} max={1} step={0.05} value={track.volume} aria-label={t('harmony.trackVolume', { instrument: t(`harmony.instrument.${track.instrument}` as never) })} className="w-full accent-primary" onChange={event => update(current => ({ ...current, tracks: current.tracks.map(item => item.id === track.id ? { ...item, volume: Number(event.target.value) } : item) }))} />
            </div>)}
          </div>
        </section>
      </div>
    </section>
  )
}
