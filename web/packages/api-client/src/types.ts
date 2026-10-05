export type PublicBranding = {
  name: string | null
  logoUrl: string | null
  accentHex: string | null
  secondaryHex: string | null
  bannerUrl: string | null
  loginHeadline: string | null
  themeDefault?: string | null
}

export type EventRsvpResponse = 'yes' | 'no' | 'maybe'

export type EventRsvpItem = {
  userId: string
  displayName: string
  response: EventRsvpResponse | string
  updatedAt: string
}

export type EventRsvpUpsertResult = {
  userId: string
  response: EventRsvpResponse | string
  updatedAt: string
}
