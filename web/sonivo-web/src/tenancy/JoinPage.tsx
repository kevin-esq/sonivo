import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { acceptInvitation, ApiError, type CurrentUser } from '../api/client'
import { mutationErrorMessage, primaryButtonClass, ProblemAlert } from '../repertoire/ui'

const JOIN_NEXT_PATH = /^\/join\/[A-Za-z0-9._~-]+$/

export function safeJoinNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!JOIN_NEXT_PATH.test(value)) return null
  return value
}

export function JoinPage({ user }: { user: CurrentUser | null | undefined }) {
  const { token } = useParams()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alreadyMember, setAlreadyMember] = useState(false)

  if (user === undefined) {
    return <p aria-live="polite">Checking session…</p>
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
        setError('This invite is invalid or expired.')
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
      <h2 id="join-heading" className="text-xl font-medium">
        Join this group
      </h2>
      <ProblemAlert message={error} />
      {alreadyMember ? (
        <div className="space-y-2" role="alert">
          <p>You are already a member of this group.</p>
          <Link className="underline" to="/">
            Home
          </Link>
        </div>
      ) : (
        <button
          type="button"
          className={primaryButtonClass}
          disabled={pending || !token}
          onClick={() => void onAccept()}
        >
          {pending ? 'Working…' : 'Accept invite'}
        </button>
      )}
    </section>
  )
}
