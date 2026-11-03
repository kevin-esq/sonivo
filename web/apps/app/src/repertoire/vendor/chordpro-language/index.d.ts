import { LRLanguage, LanguageSupport } from '@codemirror/language';
import * as _codemirror_state from '@codemirror/state';

declare const exampleStringLinter: _codemirror_state.Extension;

declare const ChordProLanguage: LRLanguage;
declare function ChordPro(): LanguageSupport;

export { ChordPro, ChordProLanguage, exampleStringLinter };
