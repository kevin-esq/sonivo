import { routes } from '../routing/routes'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AppLink, type NavigationMode } from '../routing/AppLink'
import { acceptInvitation, ApiError, type CurrentUser } from '../api/client'
import { useT } from '../i18n'
import { mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { Button } from '../ui/button'
import { safeJoinNextPath } from './safeJoinNextPath'

export { safeJoinNextPath } from './safeJoinNextPath'

export function JoinPage({ user }: { user: CurrentUser | null | undefined }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const { t } = useT()

  if (user === undefined) return <p aria-live="polite">{t('joinGroup.checking')}</p>
  if (!user) {
    const next = token ? routes.joinInvitation(token) : routes.join
    const loginSearch = safeJoinNextPath(next) ? `?next=${encodeURIComponent(next)}` : ''
    return <Navigate to={`${routes.login}${loginSearch}`} replace />
  }

  return <JoinInvitationContent token={token ?? ''} navigate={navigate} />
}

export function JoinInvitationContent({ token, navigate, navigationMode = 'legacy' }: {
  token: string
  navigate: (to: string) => void
  navigationMode?: NavigationMode
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const { t } = useT()

  async function onAccept() {
    if (!token) return
    setPending(true)
    setError(null)
    setAlreadyMember(false)
    try {
      const accepted = await acceptInvitation(token)
      navigate(routes.group(accepted.groupId))
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(t('joinGroup.invalid'))
      } else if (err instanceof ApiError && err.status === 409) {
        setAlreadyMember(true)
      } else {
        setError(mutationErrorMessage(err, t))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="join-heading">
      <div className="space-y-2">
        <h1 id="join-heading" className="text-2xl font-bold tracking-tight">
          {t('joinGroup.title')}
        </h1>
        <p className="text-sm text-muted">
          {t('joinGroup.subtitle')}
        </p>
      </div>
      <ProblemAlert message={error} />
      {alreadyMember ? (
        <div className="space-y-2" role="alert">
          <p>{t('joinGroup.alreadyMember')}</p>
          <AppLink mode={navigationMode} className="font-semibold text-primary-ink no-underline hover:underline" to={routes.home}>
            {t('joinGroup.home')}
          </AppLink>
        </div>
      ) : (
        <Button disabled={pending || !token} onClick={() => void onAccept()}>
          {pending ? t('joinGroup.working') : t('joinGroup.accept')}
        </Button>
      )}
    </section>
  )
}
