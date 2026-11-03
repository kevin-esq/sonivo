import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CompletionContext } from '@codemirror/autocomplete'
import { Compartment, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { ChordProLanguage } from './vendor/chordpro-language/index.js'
import { useT, type I18nKey } from '../i18n'
import {
  chordCompletionCandidates,
  chordContextAt,
  existingChordTokens,
  validateChordProSource,
  type ChordProIssue,
} from './chordPro'
import { chordNotes } from './chordSymbols'
import { createChordBookEditor } from './chordBookEditor'

type ChordProSourceEditorProps = {
  value: string
  onChange: (value: string) => void
  defaultKey?: string | null
  testId?: string
  ariaLabel?: string
  disabled?: boolean
}

const ISSUE_KEYS: Record<ChordProIssue['code'], I18nKey> = {
  unclosedChord: 'arrangement.chordProIssueUnclosedChord',
  unexpectedChordClose: 'arrangement.chordProIssueUnexpectedChordClose',
  unclosedDirective: 'arrangement.chordProIssueUnclosedDirective',
  unexpectedDirectiveClose: 'arrangement.chordProIssueUnexpectedDirectiveClose',
  emptyChord: 'arrangement.chordProIssueEmptyChord',
  unknownDirective: 'arrangement.chordProIssueUnknownDirective',
  unexpectedSectionEnd: 'arrangement.chordProIssueUnexpectedSectionEnd',
  unclosedSection: 'arrangement.chordProIssueUnclosedSection',
  duplicateMetadata: 'arrangement.chordProIssueDuplicateMetadata',
  nonCanonicalChord: 'arrangement.chordProIssueNonCanonicalChord',
  unrecognizedChord: 'arrangement.chordProIssueUnrecognizedChord',
}

const SNIPPETS: Array<{ key: I18nKey; template: string }> = [
  { key: 'arrangement.chordProSnippetVerse', template: '{start_of_verse}\n|\n{end_of_verse}' },
  { key: 'arrangement.chordProSnippetChorus', template: '{start_of_chorus}\n|\n{end_of_chorus}' },
  { key: 'arrangement.chordProSnippetBridge', template: '{start_of_bridge}\n|\n{end_of_bridge}' },
  { key: 'arrangement.chordProSnippetComment', template: '{c: |}' },
  { key: 'arrangement.chordProSnippetTab', template: '{start_of_tab}\n|\n{end_of_tab}' },
]

const TOOLBAR_BUTTON = 'rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink hover:bg-surface-hover disabled:opacity-50'

export function ChordProSourceEditor({ value, onChange, defaultKey, testId, ariaLabel, disabled }: ChordProSourceEditorProps) {
  const { t } = useT()
  const issuesId = useId()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const keyRef = useRef(defaultKey)
  const onChangeRef = useRef(onChange)
  const syntaxErrorRef = useRef(t('arrangement.chordProSyntaxError'))
  const syncRef = useRef(false)
  const editableCompartment = useRef(new Compartment())
  const [cursor, setCursor] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [find, setFind] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)

  keyRef.current = defaultKey
  onChangeRef.current = onChange
  syntaxErrorRef.current = t('arrangement.chordProSyntaxError')

  const matches = useMemo(() => {
    if (!find) return [] as number[]
    const haystack = value.toLowerCase()
    const needle = find.toLowerCase()
    const indexes: number[] = []
    let from = 0
    while (from <= haystack.length) {
      const at = haystack.indexOf(needle, from)
      if (at === -1) break
      indexes.push(at)
      from = at + Math.max(needle.length, 1)
    }
    return indexes
  }, [find, value])
  const currentMatch = matches.length > 0 ? Math.min(matchIndex, matches.length - 1) : -1
  const issues = useMemo(() => validateChordProSource(value), [value])
  const visibleIssues = [...issues.filter((issue) => issue.severity === 'error'), ...issues.filter((issue) => issue.severity === 'warning')].slice(0, 5)
  const context = useMemo(() => chordContextAt(value, cursor), [value, cursor])
  const partial = context?.partial.split(/\s+/).at(-1) ?? ''
  const partialNotes = useMemo(() => context ? chordNotes(partial) : [], [context, partial])

  useEffect(() => {
    if (!hostRef.current) return
    const chordCompletion: Extension = ChordProLanguage.data.of({
      autocomplete: (completionContext: CompletionContext) => {
        const text = completionContext.state.doc.toString()
        const chordContext = chordContextAt(text, completionContext.pos)
        if (!chordContext) return null
        const beforeCursor = text.slice(chordContext.start, completionContext.pos)
        const token = beforeCursor.split(/\s+/).at(-1) ?? ''
        if (!token) return null
        const from = completionContext.pos - token.length
        const existing = existingChordTokens(text)
        const options = chordCompletionCandidates(token, { key: keyRef.current, existing })
          .map((label) => ({ label, type: 'chord', boost: label === token ? 0 : 1 }))
        return options.length ? { from, options } : null
      },
    })
    const view = createChordBookEditor(hostRef.current, value, [
      chordCompletion,
      editableCompartment.current.of(EditorView.editable.of(!disabled)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !syncRef.current) onChangeRef.current(update.state.doc.toString())
        if (update.docChanged || update.selectionSet) setCursor(update.state.selection.main.head)
      }),
    ], () => syntaxErrorRef.current)
    viewRef.current = view
    view.contentDOM.setAttribute('aria-label', ariaLabel ?? '')
    view.contentDOM.setAttribute('aria-describedby', issuesId)
    if (testId) view.contentDOM.setAttribute('data-testid', testId)
    return () => {
      view.destroy()
      viewRef.current = null
    }
  // The CodeMirror instance lives for this component's lifetime; changing props sync through effects below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    syncRef.current = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    syncRef.current = false
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: editableCompartment.current.reconfigure(EditorView.editable.of(!disabled)) })
  }, [disabled])

  useEffect(() => {
    const content = viewRef.current?.contentDOM
    if (!content) return
    content.setAttribute('aria-label', ariaLabel ?? '')
    content.setAttribute('aria-describedby', issuesId)
    if (testId) content.setAttribute('data-testid', testId)
    else content.removeAttribute('data-testid')
  }, [ariaLabel, issuesId, testId])

  function focusRange(from: number, to: number) {
    const view = viewRef.current
    if (!view) return
    view.focus()
    view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true })
  }

  function selectMatch(index: number) {
    const at = matches[index]
    if (at === undefined) return
    setMatchIndex(index)
    focusRange(at, at + find.length)
  }

  function replaceCurrent() {
    const at = matches[currentMatch]
    const view = viewRef.current
    if (at === undefined || !view) return
    const caret = at + replacement.length
    view.dispatch({ changes: { from: at, to: at + find.length, insert: replacement }, selection: { anchor: caret }, scrollIntoView: true })
  }

  function replaceAllMatches() {
    if (!find || !viewRef.current) return
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    viewRef.current.dispatch({ changes: { from: 0, to: value.length, insert: value.replace(new RegExp(escaped, 'gi'), replacement) } })
    setMatchIndex(0)
  }

  function insertSnippet(template: string) {
    const view = viewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const before = value.slice(0, from)
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
    const marker = template.indexOf('|')
    const body = template.replace('|', '')
    const caret = from + prefix.length + (marker >= 0 ? marker : body.length)
    view.dispatch({ changes: { from, to, insert: `${prefix}${body}` }, selection: { anchor: caret }, scrollIntoView: true })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted">{t('arrangement.chordProSnippetsLabel')}</span>
        {SNIPPETS.map((snippet) => (
          <button key={snippet.key} type="button" className={TOOLBAR_BUTTON} disabled={disabled} onClick={() => insertSnippet(snippet.template)}>
            {t(snippet.key)}
          </button>
        ))}
        <button type="button" className={TOOLBAR_BUTTON} aria-expanded={findOpen} onClick={() => setFindOpen((open) => !open)}>
          {t('arrangement.chordProOpenFind')}
        </button>
      </div>

      {findOpen ? (
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-hover p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="min-w-40 flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink outline-none focus:ring-2 focus:ring-primary" aria-label={t('arrangement.chordProFindLabel')} placeholder={t('arrangement.chordProFindLabel')} value={find} onChange={(event) => { setFind(event.target.value); setMatchIndex(0) }} />
            <span className="text-xs text-muted">{find ? matches.length > 0 ? t('arrangement.chordProFindCount', { current: currentMatch + 1, total: matches.length }) : t('arrangement.chordProFindNoMatches') : null}</span>
            <button type="button" className={TOOLBAR_BUTTON} disabled={matches.length === 0} aria-label={t('arrangement.chordProFindPrevious')} onClick={() => selectMatch((currentMatch - 1 + matches.length) % matches.length)}>↑</button>
            <button type="button" className={TOOLBAR_BUTTON} disabled={matches.length === 0} aria-label={t('arrangement.chordProFindNext')} onClick={() => selectMatch((currentMatch + 1) % matches.length)}>↓</button>
            <button type="button" className={TOOLBAR_BUTTON} aria-label={t('arrangement.chordProCloseFind')} onClick={() => setFindOpen(false)}>✕</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input className="min-w-40 flex-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-xs text-ink outline-none focus:ring-2 focus:ring-primary" aria-label={t('arrangement.chordProReplaceLabel')} placeholder={t('arrangement.chordProReplaceLabel')} value={replacement} onChange={(event) => setReplacement(event.target.value)} />
            <button type="button" className={TOOLBAR_BUTTON} disabled={!find || matches.length === 0} onClick={replaceCurrent}>{t('arrangement.chordProReplaceOne')}</button>
            <button type="button" className={TOOLBAR_BUTTON} disabled={!find || matches.length === 0} onClick={replaceAllMatches}>{t('arrangement.chordProReplaceAll')}</button>
          </div>
        </div>
      ) : null}

      <div className="h-64 min-h-36 max-h-64 overflow-hidden rounded-lg border border-border-subtle bg-surface-hover focus-within:ring-2 focus-within:ring-primary" ref={hostRef} />
      {partialNotes.length > 0 ? <p className="text-xs text-muted" data-testid="chordpro-caret-notes">{t('arrangement.chordNotes', { notes: partialNotes.join(' · ') })}</p> : null}
      <p className="text-xs text-muted">{t('arrangement.chordProEditorHint')}</p>

      <div id={issuesId} className="space-y-1" aria-live="polite">
        {visibleIssues.length === 0 ? value.trim() ? <p className="text-xs text-muted">{t('arrangement.chordProValidationClean')}</p> : null : (
          <>
            <p className="text-xs font-semibold text-muted">{t('arrangement.chordProIssuesTitle')}</p>
            <ul className="space-y-1">
              {visibleIssues.map((issue, index) => <li key={`${issue.line}-${issue.column}-${index}`} className={`text-xs ${issue.severity === 'error' ? 'text-error-ink' : 'text-muted'}`}>{t(ISSUE_KEYS[issue.code], { line: issue.line, name: issue.detail ?? '' })}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
