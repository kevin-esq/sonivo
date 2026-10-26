import { Suspense } from 'react'
import { GroupSlugAppPage } from '@/src/tenancy/GroupSlugAppPage'

// Slug resolution and membership checks remain in the existing route module
// and API. This only assigns URL ownership to the request-aware Next server.
export async function generateStaticParams() {
  return [{ segments: ['static-export-fallback'] }]
}

export default function SlugRoutePage() {
  return <Suspense fallback={null}><GroupSlugAppPage /></Suspense>
}
