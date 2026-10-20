import { createContext, useContext } from 'react'

export type BrandTokenMap = Record<string, string>

export type BrandDraft = {
  displayName: string
  accentHex: string
  secondaryHex: string
  accentColorHex: string
  successHex: string
  warningHex: string
  errorHex: string
  typography: string
  cover: string
  themeDefault: string
  defaultLocale: string
  welcomeText: string
  loginHeadline: string
  tagline: string
  verse: string
  showSonivoCredit: boolean
  themeId: string
  intensity: 'subtle' | 'medium' | 'intense'
  gradientStyle: 'fixed' | 'liquid'
}

export type BrandPreviewDraft = {
  groupId: string
  groupName: string
  editor: BrandDraft
  pendingImages: Partial<Record<'logo' | 'banner' | 'favicon', { file: File; url: string }>>
  tokens: BrandTokenMap
  displayName: string
  tagline: string
  verse: string
  cover: string
  savedCover: string
  savedBannerUrl: string | null
  dirty: boolean
  save: () => Promise<string | null>
  discard: () => void
}

export type BrandPreviewValue = {
  draft: BrandPreviewDraft | null
  setDraft: (draft: BrandPreviewDraft | null) => void
  savedBrand: {
    groupId: string
    accentHex: string | null
    displayName: string | null
    tagline: string | null
    verse: string | null
    welcomeText: string | null
    cover: string
    bannerUrl: string | null
  } | null
}

export const BrandPreviewContext = createContext<BrandPreviewValue>({
  draft: null,
  setDraft: () => {},
  savedBrand: null,
})

export function useBrandPreview(): BrandPreviewValue {
  return useContext(BrandPreviewContext)
}
