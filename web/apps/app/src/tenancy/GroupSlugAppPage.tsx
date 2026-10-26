'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation'
import { getGroupBySlug } from '../api/client'
import { useAppRuntime } from '../appRuntime/context'
import { useT } from '../i18n'
import { routes } from '../routing/routes'
import { rememberLastGroup } from './groupSlug'
import { SessionScreen } from '../shell/GroupsChrome'
import { MustChangePassword } from '../shell/MustChangePassword'
import { Button } from '../ui/button'

type Resolution = 'loading' | 'missing' | { slug: string; groupId: string }

function GroupSlugAppPageContent() {
  const { segments } = useParams<{ segments: string[] }>()
  const slug = segments?.[0]
  const pathname = usePathname() ?? routes.groupSlug(slug ?? '')
  const params = useSearchParams()
  const search = params.toString() ? `?${params.toString()}` : ''
  const router = useRouter()
  const { session, onRetry } = useAppRuntime()
  const { t } = useT()
  const [resolution, setResolution] = useState<Resolution>('loading')

  useEffect(() => {
    if (session.status === 'loading' || session.status === 'error') return
    if (session.status === 'guest') {
      const next = `${pathname}${search}`
      router.replace(`${routes.login}?next=${encodeURIComponent(next)}`)
      return
    }
    if (!slug) {
      setResolution('missing')
      return
    }
    let cancelled = false
    setResolution('loading')
    getGroupBySlug(slug)
      .then((group) => {
        if (cancelled) return
        rememberLastGroup(group.id)
        setResolution({ slug, groupId: group.id })
      })
      .catch(() => {
        if (!cancelled) setResolution('missing')
      })
    return () => {
      cancelled = true
    }
  }, [pathname, router, search, session.status, slug])

  useEffect(() => {
    if (typeof resolution !== 'object' || resolution.slug !== slug) return
    const slugPath = routes.groupSlug(slug ?? '')
    const remainder = pathname.slice(slugPath.length)
    router.replace(`${routes.group(resolution.groupId)}${remainder}${search}${window.location.hash}`)
  }, [pathname, resolution, router, search, slug])

  if (session.status === 'loading') return <SessionScreen message={t('state.checkingSession')} />
  if (session.status === 'error') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-6 py-10 text-ink">
        <div role="alert" className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">{t('state.offlineTitle')}</h1>
          <p className="text-sm text-muted">{t('state.offlineBody')}</p>
          <Button onClick={onRetry}>{t('state.retry')}</Button>
        </div>
      </div>
    )
  }
  if (session.status === 'authenticated' && session.user.mustChangePassword) return <MustChangePassword onDone={onRetry} />
  if (session.status === 'guest') return <SessionScreen message={t('state.checkingSession')} />

  if (resolution === 'missing') {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas px-4 text-center text-shell-foreground">
        <div className="space-y-3">
          <p className="text-lg font-semibold">{t('slug.notFound')}</p>
          <Link className="font-semibold text-secondary-ink no-underline hover:underline" href={routes.groups}>
            {t('slug.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-shell-foreground" role="status" aria-live="polite">
      {t('slug.resolving')}
    </div>
  )
}

export function GroupSlugAppPage() {
  return <GroupSlugAppPageContent />
}
