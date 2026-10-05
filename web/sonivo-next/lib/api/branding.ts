import { cache } from 'react'
import type { PublicBranding } from './types'

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5171'

/**
 * Anonymous public branding for a tenant slug (existing API endpoint). Returns
 * null on 404 so callers can render a neutral not-found. `cache` dedupes the
 * request across root layout, tenant layout and generateMetadata.
 */
export const getPublicBranding = cache(async (slug: string): Promise<PublicBranding | null> => {
  const response = await fetch(
    `${apiOrigin}/api/groups/by-slug/${encodeURIComponent(slug)}/branding`,
    { next: { revalidate: 60, tags: [`tenant:${slug}`] } },
  )

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Failed to load branding for "${slug}" (${response.status})`)
  }
  return (await response.json()) as PublicBranding
})
