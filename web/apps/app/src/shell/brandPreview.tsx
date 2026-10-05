import { createContext, useContext } from 'react'

/**
 * Live brand preview (owner 2026-10-05). The branding editor publishes the
 * draft token map here while it is open, so the whole group workspace repaints
 * in real time — before saving — instead of only the small preview cards.
 *
 * The group shell owns the state and merges `tokens` over the server-saved
 * tokens; the editor only writes to it and clears on unmount.
 */
export type BrandTokenMap = Record<string, string>

export type BrandPreviewValue = {
  tokens: BrandTokenMap | null
  setTokens: (tokens: BrandTokenMap | null) => void
}

const noop = () => {}

export const BrandPreviewContext = createContext<BrandPreviewValue>({
  tokens: null,
  setTokens: noop,
})

export function useBrandPreview(): BrandPreviewValue {
  return useContext(BrandPreviewContext)
}
