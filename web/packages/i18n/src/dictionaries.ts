import { cache } from 'react'
import type { Locale } from './config'

export type Dictionary = Record<string, string>

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  es: () => import('./messages/es.json').then((module) => module.default as Dictionary),
  en: () => import('./messages/en.json').then((module) => module.default as Dictionary),
  pt: () => import('./messages/pt.json').then((module) => module.default as Dictionary),
}

/**
 * Loads the active locale dictionary on the server. `cache` dedupes the import
 * within a single request. Only the active locale is shipped to the client.
 */
export const getDictionary = cache((locale: Locale): Promise<Dictionary> =>
  loaders[locale](),
)
