import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus, acceptCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { lintKeymap, lintGutter } from '@codemirror/lint'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { ChordPro } from './vendor/chordpro-language/index.js'
import { syntaxTree } from '@codemirror/language'
import { linter, type Diagnostic } from '@codemirror/lint'

// Adapted from ChordBook Editor, Copyright (c) 2024-present ChordBook contributors.
function syntaxLinter(view: EditorView, errorMessage: () => string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.type.isError) {
        diagnostics.push({ from: node.from, to: node.to, severity: 'error', message: errorMessage() })
      }
    },
  })
  return diagnostics
}

export function createChordBookEditor(parent: HTMLElement, doc: string, extra: Extension[], errorMessage: () => string) {
  const extensions: Extension[] = [
    EditorView.theme({
      '&': { height: '100%', color: 'var(--color-ink)', backgroundColor: 'var(--color-surface-hover)', fontSize: '0.75rem' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.25rem' },
      '.cm-content': { minHeight: '9rem', padding: '0.75rem' },
      '.cm-gutters': { color: 'var(--color-muted)', backgroundColor: 'var(--color-surface)', border: 'none' },
      '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' },
      '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)' },
      '.cm-tooltip': { zIndex: '30' },
    }),
    ChordPro(),
    linter((view) => syntaxLinter(view, errorMessage)),
    lintGutter(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    autocompletion(),
    EditorState.allowMultipleSelections.of(true),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      { key: 'Tab', preventDefault: true, run: (view) => completionStatus(view.state) ? acceptCompletion(view) : false },
    ]),
    ...extra,
  ]

  return new EditorView({ state: EditorState.create({ doc, extensions }), parent })
}
