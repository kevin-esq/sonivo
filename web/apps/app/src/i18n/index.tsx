import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Language = "es" | "en" | "pt";

export const LANGUAGES: readonly Language[] = ["es", "en", "pt"];

const STORAGE_KEY = "sonivo:lang";

import { es } from './locales/es'
import { en } from './locales/en'
import { pt } from './locales/pt'
import type { I18nKey } from './keys'

export type { I18nKey } from './keys'

const dictionaries: Record<Language, Record<I18nKey, string>> = { es, en, pt };

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export type TParams = Record<string, string | number>;

function isLanguage(value: string | null): value is Language {
  return value === "es" || value === "en" || value === "pt";
}

function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null; // storage unavailable (private mode)
  }
}

// Spanish is the default: it never changes on its own based on the browser language (keeps E2E and SSR deterministic);
// English only applies after an explicit user choice via setLang.
function detectInitialLanguage(): Language {
  return readStoredLanguage() ?? "es";
}

/**
 * Replaces {name} placeholders. Allows keys like
 * 'Hello, {name}' instead of building sentences with Prefix + value + Suffix,
 * which break word order in other languages.
 * The current keys (…Prefix / …Suffix) keep working the same.
 */
function format(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: I18nKey, params?: TParams) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = useCallback((next: Language) => {
    if (!isLanguage(next)) return;
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // saving is best-effort
    }
  }, []);

  // Accessibility and SEO: screen readers, spell checking and auto-translation use <html lang>.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Keeps multiple open tabs in sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (isLanguage(event.newValue)) setLangState(event.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const t = useCallback(
    (key: I18nKey, params?: TParams): string =>
      format(dictionaries[lang][key] ?? es[key], params),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useT(): Pick<LanguageContextValue, "t" | "lang"> {
  const { t, lang } = useLanguage();
  return { t, lang };
}

