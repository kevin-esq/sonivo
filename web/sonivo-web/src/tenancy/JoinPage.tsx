import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { acceptInvitation, ApiError, type CurrentUser } from '../api/client'
import { useT } from '../i18n'
import { mutationErrorMessage, ProblemAlert } from '../repertoire/ui'
import { Button } from '../ui/button'
import { safeJoinNextPath } from './safeJoinNextPath'

export { safeJoinNextPath } from './safeJoinNextPath'

export function JoinPage({ user }: { user: CurrentUser | null | undefined }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const { t } = useT()

  if (user === undefined) {
    return <p aria-live="polite">{t('unirse.checking')}</p>
  }

  if (!user) {
    const next = token ? `/join/${token}` : '/join'
    const loginSearch = safeJoinNextPath(next)
      ? `?next=${encodeURIComponent(next)}`
      : ''
    return <Navigate to={`/login${loginSearch}`} replace />
  }

  async function onAccept() {
    if (!token) return
    setPending(true)
    setError(null)
    setAlreadyMember(false)
    try {
      const accepted = await acceptInvitation(token)
      navigate(`/groups/${accepted.groupId}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError('Esta invitación no es válida o ha caducado.')
      } else if (err instanceof ApiError && err.status === 409) {
        setAlreadyMember(true)
      } else {
        setError(mutationErrorMessage(err))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="join-heading">
      <div className="space-y-2">
        <h1 id="join-heading" className="text-2xl font-bold tracking-tight">
          {t('unirse.title')}
        </h1>
        <p className="text-sm text-slate-500">
          {t('unirse.subtitle')}
        </p>
      </div>
      <ProblemAlert message={error} />
      {alreadyMember ? (
        <div className="space-y-2" role="alert">
          <p>{t('unirse.alreadyMember')}</p>
          <Link className="font-semibold text-primary-ink no-underline hover:underline" to="/">
            {t('unirse.home')}
          </Link>
        </div>
      ) : (
        <Button disabled={pending || !token} onClick={() => void onAccept()}>
          {pending ? t('unirse.working') : t('unirse.accept')}
        </Button>
      )}
    </section>
  )
}
