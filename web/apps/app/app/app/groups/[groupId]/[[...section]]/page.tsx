import { GroupRouteContent } from './GroupRouteContent'
import { Suspense } from 'react'

// Export needs concrete paths for an optional catch-all route. These are
// compatibility files; real Group identifiers resolve on the Next server.
export async function generateStaticParams() {
  return [
    { section: [] },
    { section: ['static-export-fallback'] },
  ]
}

export default function GroupRoutePage() {
  if (process.env.NEXT_EXPORT === '1') return null
  return <Suspense fallback={null}><GroupRouteContent /></Suspense>
}
