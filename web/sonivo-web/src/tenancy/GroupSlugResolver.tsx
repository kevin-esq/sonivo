import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { getGroupBySlug } from '../api/client'
import { useT } from '../i18n'
import { rememberLastGroup } from './groupSlug'

type ResolveState = 'loading' | 'missing' | { id: string }

/**
 * `/g/{slug}` entry (ADR-0045 D1): resolves the slug (current or historical) to
 * its group, remembers the last group and forwards to the group workspace while
 * preserving the sub-path. Unknown/foreign slugs show the same not-found screen
 * (the API returns an identical 404), so the slug cannot be enumerated.
 */
export function GroupSlugResolver() {
  const { slug } = useParams()
  const location = useLocation()
  const { t } = useT()
  const [state, setState] = useState<ResolveState>('loading')

  useEffect(() => {
    let cancelled = false
    if (!slug) {
      setState('missing')
      return
    }
    getGroupBySlug(slug)
      .then((group) => {
        if (cancelled) return
        rememberLastGroup(group.id)
        setState({ id: group.id })
      })
      .catch(() => {
        if (!cancelled) setState('missing')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state === 'loading') {
    return (
      <div
        className="grid min-h-screen place-items-center bg-canvas text-shell-foreground"
        role="status"
        aria-live="polite"
      >
        {t('slug.resolving')}
      </div>
    )
  }

  if (state === 'missing') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4 text-center text-shell-foreground">
        <div className="space-y-3">
          <p className="text-lg font-semibold">{t('slug.notFound')}</p>
          <Link className="font-semibold text-secondary-ink no-underline hover:underline" to="/">
            {t('slug.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  const rest = location.pathname.slice(`/g/${slug}`.length)
  return <Navigate to={`/groups/${state.id}${rest}${location.search}`} replace />
}
