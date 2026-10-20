import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { useT } from '../i18n'
import type { I18nKey } from '../i18n/keys'
import { StageModePanel } from './StageModePanel'

type WarmupKind = 'voice' | 'instrument'
type WarmupRange = 'lower' | 'middle' | 'higher'
type PianoCuePhase = 'listen' | 'sing' | 'breathe'

type WarmupStep = {
  titleKey: I18nKey
  instructionKey: I18nKey
  durationSeconds: number
}

type PianoEvent = {
  semitones: number[]
  duration: number
  velocity?: number
  pauseAfter?: number
  phase?: PianoCuePhase
}

const pianoPitchClasses = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']

function getPianoSample(semitones: number): { midiPitch: number; filename: string } {
  const midiPitch = 60 + semitones
  const pitchClass = pianoPitchClasses[midiPitch % 12]
  const octave = Math.floor(midiPitch / 12) - 1
  return {
    midiPitch,
    filename: `INSPiano_Vel03_${pitchClass}${octave}_01.ogg`,
  }
}

type PracticeWarmupProps = {
  groupId: string
  arrangementId: string
  songTitle: string
  hasAudio: boolean
  isPlaying: boolean
  progress: number
  duration: number
  volume: number
  metronomeBpm: number
  metronomeOn: boolean
  metronomePulse: boolean
  onTogglePlayback: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onMetronomeBpmChange: (bpm: number) => void
  onMetronomeToggle: () => void
}

const warmupSteps: Record<WarmupKind, WarmupStep[]> = {
  voice: [
    {
      titleKey: 'practice.warmup.voice.stepOneTitle',
      instructionKey: 'practice.warmup.voice.stepOne',
      durationSeconds: 60,
    },
    {
      titleKey: 'practice.warmup.voice.stepTwoTitle',
      instructionKey: 'practice.warmup.voice.stepTwo',
      durationSeconds: 120,
    },
    {
      titleKey: 'practice.warmup.voice.stepThreeTitle',
      instructionKey: 'practice.warmup.voice.stepThree',
      durationSeconds: 120,
    },
  ],
  instrument: [
    {
      titleKey: 'practice.warmup.instrument.stepOneTitle',
      instructionKey: 'practice.warmup.instrument.stepOne',
      durationSeconds: 60,
    },
    {
      titleKey: 'practice.warmup.instrument.stepTwoTitle',
      instructionKey: 'practice.warmup.instrument.stepTwo',
      durationSeconds: 120,
    },
    {
      titleKey: 'practice.warmup.instrument.stepThreeTitle',
      instructionKey: 'practice.warmup.instrument.stepThree',
      durationSeconds: 120,
    },
  ],
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function PracticeWarmup({
  groupId,
  arrangementId,
  songTitle,
  hasAudio,
  isPlaying: playerIsPlaying,
  progress: playerProgress,
  duration: playerDuration,
  volume: playerVolume,
  metronomeBpm,
  metronomeOn,
  metronomePulse,
  onTogglePlayback,
  onSeek,
  onVolumeChange,
  onMetronomeBpmChange,
  onMetronomeToggle,
}: PracticeWarmupProps) {
  const { t } = useT()
  const [kind, setKind] = useState<WarmupKind>('voice')
  const [range, setRange] = useState<WarmupRange>('middle')
  const [stepIndex, setStepIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(60)
  const [isRunning, setIsRunning] = useState(false)
  const [isPlayingCue, setIsPlayingCue] = useState(false)
  const [pianoCuePhase, setPianoCuePhase] = useState<PianoCuePhase | null>(null)
  const [cueError, setCueError] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const pianoBuffersRef = useRef(new Map<number, AudioBuffer>())
  const cueSourcesRef = useRef<AudioBufferSourceNode[]>([])
  const cueRunIdRef = useRef(0)
  const cueTimeoutRef = useRef<number | null>(null)
  const cuePhaseTimeoutsRef = useRef<number[]>([])
  const steps = warmupSteps[kind]
  const currentStep = steps[stepIndex]
  const totalSeconds = steps.reduce((total, step) => total + step.durationSeconds, 0)
  const isComplete = stepIndex === steps.length - 1 && remainingSeconds === 0

  useEffect(() => () => {
    if (cueTimeoutRef.current != null) window.clearTimeout(cueTimeoutRef.current)
    cuePhaseTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
    void audioContextRef.current?.close()
  }, [])

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => {
      setElapsedSeconds((elapsed) => Math.min(totalSeconds, elapsed + 1))
      if (remainingSeconds > 1) {
        setRemainingSeconds(remainingSeconds - 1)
      } else if (stepIndex < steps.length - 1) {
        const nextIndex = stepIndex + 1
        setStepIndex(nextIndex)
        setRemainingSeconds(steps[nextIndex].durationSeconds)
      } else {
        setRemainingSeconds(0)
        setIsRunning(false)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isRunning, remainingSeconds, stepIndex, steps, totalSeconds])

  useEffect(() => {
    setStepIndex(0)
    setElapsedSeconds(0)
    setRemainingSeconds(steps[0].durationSeconds)
    setIsRunning(false)
  }, [kind, steps])

  function resetSession() {
    setStepIndex(0)
    setElapsedSeconds(0)
    setRemainingSeconds(steps[0].durationSeconds)
    setIsRunning(false)
  }

  function advanceStep() {
    if (stepIndex >= steps.length - 1) {
      setIsRunning(false)
      setRemainingSeconds(0)
      return
    }
    const nextIndex = stepIndex + 1
    setStepIndex(nextIndex)
    setRemainingSeconds(steps[nextIndex].durationSeconds)
  }

  function getPianoPattern(): PianoEvent[] {
    const phrase = stepIndex === 1
      ? [0, 2, 4, 5, 7, 5, 4, 2, 0]
      : [0, 4, 7, 12, 7, 4, 0]
    const notes: PianoEvent[] = []
    const rangeOffset: Record<WarmupRange, number> = { lower: -3, middle: 0, higher: 2 }
    const transpositions = [
      ...Array.from({ length: 8 }, (_, index) => index),
      ...Array.from({ length: 7 }, (_, index) => 6 - index),
    ]

    transpositions.forEach((offset, phraseIndex) => {
      const tonic = rangeOffset[range] + offset
      notes.push(
        { semitones: [tonic, tonic + 4, tonic + 7], duration: 0.38, velocity: 0.12, phase: 'listen' },
        { semitones: [tonic, tonic + 4, tonic + 7], duration: 0.38, velocity: 0.12, phase: 'listen' },
      )
      phrase.forEach((semitones, index) => {
        notes.push({
          semitones: [tonic + semitones],
          duration: index === phrase.length - 1 ? 0.48 : 0.31,
          pauseAfter: index === phrase.length - 1 && phraseIndex < transpositions.length - 1 ? 0.72 : 0,
          phase: index === 0 ? 'sing' : undefined,
        })
      })
    })

    return notes
  }

  function stopPianoCue() {
    cueRunIdRef.current += 1
    if (cueTimeoutRef.current != null) {
      window.clearTimeout(cueTimeoutRef.current)
      cueTimeoutRef.current = null
    }
    cuePhaseTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
    cuePhaseTimeoutsRef.current = []
    cueSourcesRef.current.forEach((source) => {
      try {
        source.stop()
      } catch {
        // A source may have already ended.
      }
    })
    cueSourcesRef.current = []
    setIsPlayingCue(false)
    setPianoCuePhase(null)
  }

  async function playPianoCue() {
    const cueRunId = ++cueRunIdRef.current
    if (cueTimeoutRef.current != null) window.clearTimeout(cueTimeoutRef.current)
    cuePhaseTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
    cuePhaseTimeoutsRef.current = []
    cueSourcesRef.current = []
    setCueError(false)
    setIsPlayingCue(true)
    setPianoCuePhase('listen')
    try {
      const context = audioContextRef.current ?? new AudioContext()
      audioContextRef.current = context
      await context.resume()
      const notes = getPianoPattern()
      const events = notes.map((note) => note.semitones.map(getPianoSample))
      const samples = new Map(events.flatMap((event) => event.map((sample) => [sample.midiPitch, sample.filename] as const)))
      await Promise.all([...samples].map(async ([midiPitch, filename]) => {
        if (pianoBuffersRef.current.has(midiPitch)) return
        const response = await fetch(`/audio/practice/warmup/${filename}`)
        if (!response.ok) throw new Error('Piano sample unavailable')
        const encoded = await response.arrayBuffer()
        const decoded = await context.decodeAudioData(encoded)
        pianoBuffersRef.current.set(midiPitch, decoded)
      }))
      if (cueRunId !== cueRunIdRef.current) return
      let at = context.currentTime + 0.08
      let audioEndTime = at
      let previousPhase: PianoCuePhase | null = null
      notes.forEach((note, index) => {
        if (note.phase && note.phase !== previousPhase) {
          const phase = note.phase
          cuePhaseTimeoutsRef.current.push(window.setTimeout(
            () => setPianoCuePhase(phase),
            Math.max(0, (at - context.currentTime) * 1000),
          ))
          previousPhase = phase
        }
        if (note.pauseAfter) {
          cuePhaseTimeoutsRef.current.push(window.setTimeout(
            () => setPianoCuePhase('breathe'),
            Math.max(0, (at + note.duration - context.currentTime) * 1000),
          ))
          previousPhase = 'breathe'
        }
        events[index].forEach(({ midiPitch }) => {
          const source = context.createBufferSource()
          const envelope = context.createGain()
          const buffer = pianoBuffersRef.current.get(midiPitch)
          if (!buffer) throw new Error('Piano sample unavailable')
          envelope.gain.setValueAtTime(0.0001, at)
          envelope.gain.exponentialRampToValueAtTime(note.velocity ?? 0.18, at + 0.012)
          envelope.gain.setValueAtTime(note.velocity ?? 0.18, at + Math.max(0.012, buffer.duration - 0.08))
          envelope.gain.exponentialRampToValueAtTime(0.0001, at + buffer.duration)
          source.buffer = buffer
          source.connect(envelope).connect(context.destination)
          cueSourcesRef.current.push(source)
          source.start(at)
          audioEndTime = Math.max(audioEndTime, at + buffer.duration)
          source.stop(at + buffer.duration)
        })
        at += note.duration + 0.07 + (note.pauseAfter ?? 0)
      })

      if (cueTimeoutRef.current != null) window.clearTimeout(cueTimeoutRef.current)
      cueTimeoutRef.current = window.setTimeout(() => {
        setIsPlayingCue(false)
        setPianoCuePhase(null)
        cueSourcesRef.current = []
        cuePhaseTimeoutsRef.current = []
        cueTimeoutRef.current = null
      }, Math.ceil((audioEndTime - context.currentTime) * 1000) + 100)
    } catch {
      if (cueRunId !== cueRunIdRef.current) return
      setCueError(true)
      setIsPlayingCue(false)
      setPianoCuePhase(null)
      cuePhaseTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout))
      cuePhaseTimeoutsRef.current = []
      const context = audioContextRef.current
      audioContextRef.current = null
      pianoBuffersRef.current.clear()
      cueSourcesRef.current = []
      void context?.close()
    }
  }

  const progress = isComplete ? totalSeconds : Math.min(totalSeconds, elapsedSeconds)
  const stageContent = (
    <div className="mx-auto w-full max-w-4xl space-y-7 px-2 text-center" aria-live="polite" aria-atomic="true">
      <p className="text-sm font-semibold uppercase tracking-wide text-white/65">
        {t('practice.warmup.step', { current: String(stepIndex + 1), total: String(steps.length) })}
      </p>
      <h2 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
        {t(currentStep.titleKey)}
      </h2>
      <p className="mx-auto max-w-3xl text-xl leading-relaxed text-white/80 sm:text-3xl">
        {t(currentStep.instructionKey)}
      </p>
      {kind === 'voice' && stepIndex > 0 ? (
        <p className="mx-auto max-w-4xl text-lg leading-relaxed text-white/70 sm:text-2xl">
          {t(stepIndex === 1 ? 'practice.warmup.voice.pattern.1' : 'practice.warmup.voice.pattern.2')}
        </p>
      ) : null}
      {kind === 'voice' && stepIndex > 0 && pianoCuePhase ? (
        <p className="text-lg font-semibold text-white sm:text-2xl" aria-live="polite">
          {pianoCuePhase === 'listen'
            ? t('practice.warmup.voice.phase.listen')
            : pianoCuePhase === 'sing'
              ? t('practice.warmup.voice.phase.sing')
              : t('practice.warmup.voice.phase.breathe')}
        </p>
      ) : null}
    </div>
  )
  const stageControls = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-white">
      <div className="min-w-20 text-center text-lg font-semibold tabular-nums" data-testid="practice-warmup-stage-time">
        {isComplete ? t('practice.warmup.completeTime') : formatTime(remainingSeconds)}
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === 'voice' && stepIndex > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => isPlayingCue ? stopPianoCue() : void playPianoCue()}
            >
              {isPlayingCue ? t('practice.warmup.pianoStop') : t('practice.warmup.pianoCue')}
            </Button>
            <label className="sr-only" htmlFor="practice-warmup-stage-range">{t('practice.warmup.voice.rangeLabel')}</label>
            <select
              id="practice-warmup-stage-range"
              className="h-11 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white"
              value={range}
              onChange={(event) => setRange(event.target.value as WarmupRange)}
              disabled={isPlayingCue}
            >
              <option className="text-ink" value="lower">{t('practice.warmup.voice.range.lower')}</option>
              <option className="text-ink" value="middle">{t('practice.warmup.voice.range.middle')}</option>
              <option className="text-ink" value="higher">{t('practice.warmup.voice.range.higher')}</option>
            </select>
          </div>
        ) : null}
        {kind === 'instrument' ? (
          <div className="flex items-center gap-2">
            {metronomeOn ? (
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full bg-primary transition-[opacity,transform] duration-100 motion-reduce:transition-none ${metronomePulse ? 'scale-125 opacity-100' : 'scale-90 opacity-50'}`}
              />
            ) : null}
            <label className="sr-only" htmlFor="practice-warmup-stage-bpm">{t('practice.metronomeBpm')}</label>
            <input
              id="practice-warmup-stage-bpm"
              type="number"
              min={1}
              max={400}
              value={metronomeBpm}
              disabled={metronomeOn}
              onChange={(event) => onMetronomeBpmChange(Math.max(1, Math.min(400, Number(event.target.value) || 1)))}
              className="h-11 w-20 rounded-lg border border-white/20 bg-white/5 px-2 text-center text-sm text-white disabled:opacity-60"
            />
            <Button type="button" variant={metronomeOn ? 'primary' : 'secondary'} aria-pressed={metronomeOn} onClick={onMetronomeToggle}>
              {metronomeOn ? t('practice.metronomeStop') : t('practice.metronomeStart')}
            </Button>
          </div>
        ) : null}
        {!isComplete ? (
          <>
            <Button type="button" variant="primary" onClick={() => setIsRunning((running) => !running)}>
              {isRunning
                ? t('practice.warmup.pause')
                : stepIndex > 0 || remainingSeconds < currentStep.durationSeconds
                  ? t('practice.warmup.resume')
                  : t('practice.warmup.start')}
            </Button>
            <Button type="button" variant="secondary" onClick={advanceStep}>
              {stepIndex === steps.length - 1 ? t('practice.warmup.finish') : t('practice.warmup.next')}
            </Button>
          </>
        ) : (
          <Button type="button" variant="primary" onClick={resetSession}>
            {t('practice.warmup.restart')}
          </Button>
        )}
      </div>
      {cueError ? <p role="alert" className="w-full text-sm text-white/80">{t('practice.warmup.pianoError')}</p> : null}
    </div>
  )

  return (
    <section
      className="space-y-5 rounded-2xl border border-[var(--color-score-border)] bg-[var(--color-score-paper)] p-4 text-[var(--color-score-ink)] sm:p-6"
      aria-labelledby="practice-warmup-heading"
      data-testid="practice-warmup"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="practice-warmup-heading" className="text-xl font-semibold tracking-tight">
            {t('practice.warmup.title')}
          </h2>
          <p className="text-sm text-[var(--color-score-muted)]">
            {t('practice.warmup.summary')}
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-score-paper-soft)] px-3 py-1 text-sm font-medium text-[var(--color-score-ink-soft)]">
          {t('practice.warmup.duration')}
        </span>
      </div>

      <StageModePanel
        text={`${t(currentStep.titleKey)}\n${t(currentStep.instructionKey)}`}
        timingMarks={[]}
        currentMs={0}
        title={songTitle}
        subtitle={t('practice.warmup.stageSubtitle')}
        hasAudio={hasAudio}
        isPlaying={playerIsPlaying}
        progress={playerProgress}
        duration={playerDuration}
        onTogglePlayback={onTogglePlayback}
        onSeek={onSeek}
        groupId={groupId}
        arrangementId={arrangementId}
        volume={playerVolume}
        onVolumeChange={onVolumeChange}
        displayMode="warmup"
        modeLabel={t('practice.warmup.stageModeLabel')}
        openTestId="practice-warmup-stage-open"
        openLabel={t('practice.warmup.openStage')}
        stageContent={stageContent}
        stageControls={stageControls}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('practice.warmup.kindLabel')}>
        {(['voice', 'instrument'] as const).map((option) => (
          <Button
            key={option}
            type="button"
            variant={kind === option ? 'primary' : 'secondary'}
            aria-pressed={kind === option}
            data-testid={`practice-warmup-kind-${option}`}
            onClick={() => {
              setKind(option)
              if (option === 'voice' && metronomeOn) onMetronomeToggle()
            }}
          >
            {t(`practice.warmup.kind.${option}`)}
          </Button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl bg-[var(--color-score-paper-soft)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--color-score-ink-soft)]">
            {t('practice.warmup.step', { current: String(stepIndex + 1), total: String(steps.length) })}
          </p>
          <p className="font-semibold tabular-nums" aria-live="off" data-testid="practice-warmup-time">
            {isComplete ? t('practice.warmup.completeTime') : formatTime(remainingSeconds)}
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--color-score-border)]"
          role="progressbar"
          aria-label={t('practice.warmup.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={totalSeconds}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.min(100, (progress / totalSeconds) * 100)}%` }}
          />
        </div>
        <div className="min-h-24 space-y-2" aria-live="polite" aria-atomic="true">
          <h3 className="text-lg font-semibold">{t(currentStep.titleKey)}</h3>
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-score-ink-soft)]">
            {t(currentStep.instructionKey)}
          </p>
        </div>
        {kind === 'voice' ? (
          <div className="space-y-2">
            {stepIndex > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => isPlayingCue ? stopPianoCue() : void playPianoCue()}
                  data-testid="practice-warmup-piano-cue"
                >
                  {isPlayingCue ? t('practice.warmup.pianoStop') : t('practice.warmup.pianoCue')}
                </Button>
                <label className="sr-only" htmlFor="practice-warmup-range">{t('practice.warmup.voice.rangeLabel')}</label>
                <select
                  id="practice-warmup-range"
                  className="h-11 rounded-lg border border-[var(--color-score-border)] bg-[var(--color-score-paper)] px-3 text-sm"
                  value={range}
                  onChange={(event) => setRange(event.target.value as WarmupRange)}
                  disabled={isPlayingCue}
                >
                  <option value="lower">{t('practice.warmup.voice.range.lower')}</option>
                  <option value="middle">{t('practice.warmup.voice.range.middle')}</option>
                  <option value="higher">{t('practice.warmup.voice.range.higher')}</option>
                </select>
              </div>
            ) : null}
            {pianoCuePhase && stepIndex > 0 ? (
              <p className="text-sm font-semibold text-[var(--color-score-ink-soft)]" aria-live="polite">
                {pianoCuePhase === 'listen'
                  ? t('practice.warmup.voice.phase.listen')
                  : pianoCuePhase === 'sing'
                    ? t('practice.warmup.voice.phase.sing')
                    : t('practice.warmup.voice.phase.breathe')}
              </p>
            ) : null}
            {cueError ? <p role="alert" className="text-sm text-danger-ink">{t('practice.warmup.pianoError')}</p> : null}
            {stepIndex > 0 ? (
              <p className="text-xs text-[var(--color-score-muted)]">
                {stepIndex === 1
                  ? t('practice.warmup.voice.pattern.1')
                  : t('practice.warmup.voice.pattern.2')}
              </p>
            ) : null}
            <p className="text-sm text-[var(--color-score-muted)]" data-testid="practice-warmup-safety">
              {t('practice.warmup.voice.safety')}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="practice-warmup-metronome">
            <span className="text-sm font-medium">{t('practice.metronomeTitle')}</span>
            {metronomeOn ? (
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full bg-primary transition-[opacity,transform] duration-100 motion-reduce:transition-none ${metronomePulse ? 'scale-125 opacity-100' : 'scale-90 opacity-50'}`}
              />
            ) : null}
            <label className="sr-only" htmlFor="practice-warmup-page-bpm">{t('practice.metronomeBpm')}</label>
            <input
              id="practice-warmup-page-bpm"
              type="number"
              className="h-11 w-20 rounded-lg border border-[var(--color-score-border)] bg-[var(--color-score-paper)] px-2 text-center text-sm"
              min={1}
              max={400}
              value={metronomeBpm}
              disabled={metronomeOn}
              onChange={(event) => onMetronomeBpmChange(Math.max(1, Math.min(400, Number(event.target.value) || 1)))}
            />
            <Button type="button" variant={metronomeOn ? 'primary' : 'secondary'} aria-pressed={metronomeOn} onClick={onMetronomeToggle}>
              {metronomeOn ? t('practice.metronomeStop') : t('practice.metronomeStart')}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {isComplete ? (
            <Button type="button" variant="primary" onClick={resetSession} data-testid="practice-warmup-restart">
              {t('practice.warmup.restart')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="primary"
                onClick={() => setIsRunning((running) => !running)}
                data-testid="practice-warmup-toggle"
              >
                {isRunning
                  ? t('practice.warmup.pause')
                  : stepIndex > 0 || remainingSeconds < currentStep.durationSeconds
                    ? t('practice.warmup.resume')
                    : t('practice.warmup.start')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={advanceStep}
                data-testid="practice-warmup-next"
              >
                {stepIndex === steps.length - 1
                  ? t('practice.warmup.finish')
                  : t('practice.warmup.next')}
              </Button>
              {stepIndex > 0 || remainingSeconds < currentStep.durationSeconds ? (
                <Button type="button" variant="outline" onClick={resetSession}>
                  {t('practice.warmup.restart')}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
      <p className="text-xs leading-5 text-[var(--color-score-muted)]">
        {t('practice.warmup.localNote')}
      </p>
    </section>
  )
}
