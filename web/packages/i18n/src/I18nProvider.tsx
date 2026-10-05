'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Locale } from './config'
import type { Dictionary } from './dictionaries'

type Variables = Record<string, string | number>

export type I18nValue = {
  locale: Locale
  t: (key: string, variables?: Variables) => string
}

const I18nContext = createContext<I18nValue | null>(null)

/**
 * Preserves the `useT()` contract used across the product so migrated
 * components change as little as possible; the dictionary comes from the
 * server layout so inactive locales are never shipped.
 */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: ReactNode
}) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: (key, variables) => {
        let output = dictionary[key] ?? key
        if (variables) {
          for (const [name, replacement] of Object.entries(variables)) {
            output = output.replaceAll(`{${name}}`, String(replacement))
          }
        }
        return output
      },
    }),
    [locale, dictionary],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): I18nValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useT must be used within I18nProvider')
  }
  return context
}
