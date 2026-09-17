import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ApiError,
  createGroup,
  createInvitation,
  fetchCurrentUser,
  getGroup,
  listMyGroups,
  loginUser,
  logoutUser,
  problemDetail,
  registerUser,
  type CurrentUser,
  type GroupDetail,
  type GroupSummary,
} from './api/client'
import { ArrangementDetailPage } from './repertoire/ArrangementDetailPage'
import { LibraryPage } from './repertoire/LibraryPage'
import { SongDetailPage } from './repertoire/SongDetailPage'
import {
  fieldClass,
  isOwnerRole,
  mutationErrorMessage,
  primaryButtonClass,
  ProblemAlert,
  secondaryButtonClass,
} from './repertoire/ui'
import { EventDetailPage } from './scheduling/EventDetailPage'
import { EventListPage } from './scheduling/EventListPage'
import { GroupSectionNav } from './scheduling/GroupSectionNav'
import { SetlistDetailPage } from './scheduling/SetlistDetailPage'
import { SetlistListPage } from './scheduling/SetlistListPage'
import { JoinPage, safeJoinNextPath } from './tenancy/JoinPage'

function Shell({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser | null
  onLogout: () => void
  children: React.ReactNode
}) {
  const [searchParams] = useSearchParams()
  const next = safeJoinNextPath(searchParams.get('next'))
  const loginTo = next ? `/login?next=${encodeURIComponent(next)}` : '/login'
  const registerTo = next ? `/register?next=${encodeURIComponent(next)}` : '/register'

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-slate-300 pb-4">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Sonivo</p>
        <h1 className="mt-2 text-3xl font-semibold">Groups</h1>
        <p className="mt-2 text-slate-600">
          Create and select a musical group. Open the library from a group to manage songs.
        </p>
        <nav className="mt-4 flex flex-wrap items-center gap-4 text-sm" aria-label="Primary">
          <Link className="underline" to="/">
            My groups
          </Link>
          {user ? (
            <>
              <span className="text-slate-600">{user.email}</span>
              <button type="button" className="underline" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="underline" to={loginTo}>
                Log in
              </Link>
              <Link className="underline" to={registerTo}>
                Register
              </Link>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  )
}

function AuthForm({
  mode,
  onSuccess,
}: {
  mode: 'login' | 'register'
  onSuccess: (user: CurrentUser) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeJoinNextPath(searchParams.get('next'))
  const otherModeTo =
    mode === 'login'
      ? next
        ? `/register?next=${encodeURIComponent(next)}`
        : '/register'
      : next
        ? `/login?next=${encodeURIComponent(next)}`
        : '/login'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      if (mode === 'register') {
        await registerUser({ email, password, displayName: displayName || undefined })
        const user = await loginUser({ email, password })
        onSuccess(user)
      } else {
        const user = await loginUser({ email, password })
        onSuccess(user)
      }
      navigate(next ?? '/')
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="max-w-md space-y-4" onSubmit={onSubmit} noValidate>
      <h2 className="text-xl font-medium">{mode === 'login' ? 'Log in' : 'Create account'}</h2>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      {mode === 'register' ? (
        <label className="block space-y-1">
          <span className="text-sm text-slate-700">Display name</span>
          <input
            className="w-full border border-slate-400 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
          />
        </label>
      ) : null}
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Email</span>
        <input
          className="w-full border border-slate-400 px-3 py-2"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-slate-700">Password</span>
        <input
          className="w-full border border-slate-400 px-3 py-2"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="border border-slate-800 bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? 'Working…' : mode === 'login' ? 'Log in' : 'Register'}
      </button>
      <p>
        {mode === 'login' ? (
          <Link className="underline" to={otherModeTo}>
            Register
          </Link>
        ) : (
          <Link className="underline" to={otherModeTo}>
            Log in
          </Link>
        )}
      </p>
    </form>
  )
}

function GuestAuthRoute({
  user,
  mode,
  onSuccess,
}: {
  user: CurrentUser | null | undefined
  mode: 'login' | 'register'
  onSuccess: (user: CurrentUser) => void
}) {
  const [searchParams] = useSearchParams()
  const next = safeJoinNextPath(searchParams.get('next'))
  if (user) {
    return <Navigate to={next ?? '/'} replace />
  }
  return <AuthForm mode={mode} onSuccess={onSuccess} />
}

function GroupsPage({ user }: { user: CurrentUser }) {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  async function reload() {
    setError(null)
    try {
      setGroups(await listMyGroups())
    } catch (err) {
      setError(problemDetail(err))
      setGroups([])
    }
  }

  useEffect(() => {
    void reload()
  }, [user.id])

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const created = await createGroup(name)
      setName('')
      navigate(`/groups/${created.id}`)
    } catch (err) {
      setError(problemDetail(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="groups-heading">
      <h2 id="groups-heading" className="text-xl font-medium">
        My groups
      </h2>

      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}

      {groups === null ? (
        <p aria-live="polite">Loading groups…</p>
      ) : groups.length === 0 ? (
        <p>No groups yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link className="underline" to={`/groups/${group.id}`}>
                {group.name}
              </Link>
              <span className="ml-2 text-sm text-slate-600">({group.role})</span>
            </li>
          ))}
        </ul>
      )}

      <form className="max-w-md space-y-3 border-t border-slate-300 pt-6" onSubmit={onCreate}>
        <h3 className="font-medium">Create group</h3>
        <label className="block space-y-1">
          <span className="text-sm text-slate-700">Name</span>
          <input
            className="w-full border border-slate-400 px-3 py-2"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="border border-slate-800 bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </section>
  )
}

function GroupShellPage({ user }: { user: CurrentUser }) {
  const { groupId } = useParams()
  const [group, setGroup] = useState<GroupDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
      setInviteUrl(null)
      setInviteError(null)
      setCopied(false)
      try {
        const result = await getGroup(groupId)
        if (!cancelled) setGroup(result)
      } catch (err) {
        if (cancelled) return
        setGroup(null)
        if (err instanceof ApiError && err.status === 404) {
          setError('Group not found or you do not have access.')
        } else {
          setError(problemDetail(err))
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [groupId, user.id])

  const isOwner = isOwnerRole(group?.role)

  async function onInviteMember() {
    if (!group) return
    setInviting(true)
    setInviteError(null)
    setCopied(false)
    try {
      const created = await createInvitation(group.id)
      setInviteUrl(`${window.location.origin}/join/${created.token}`)
    } catch (err) {
      setInviteError(mutationErrorMessage(err))
    } finally {
      setInviting(false)
    }
  }

  async function onCopyInviteLink() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (group === undefined) {
    return <p aria-live="polite">Loading group…</p>
  }

  if (group === null) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-red-700">
          {error}
        </p>
        <Link className="underline" to="/">
          Back to my groups
        </Link>
      </div>
    )
  }

  return (
    <section className="space-y-4" aria-labelledby="group-heading">
      <h2 id="group-heading" className="text-xl font-medium">
        {group.name}
      </h2>
      <p className="text-slate-700">
        Selected group shell. Role: <strong>{group.role}</strong>. Version:{' '}
        <strong>{group.version}</strong>.
      </p>
      <GroupSectionNav groupId={group.id} />
      {isOwner ? (
        <div className="space-y-3">
          <button
            type="button"
            className={primaryButtonClass}
            disabled={inviting}
            onClick={() => void onInviteMember()}
          >
            {inviting ? 'Working…' : 'Invite member'}
          </button>
          <ProblemAlert message={inviteError} />
          {inviteUrl ? (
            <div className="max-w-md space-y-2">
              <label className="block space-y-1">
                <span className="text-sm text-slate-700">Invite link</span>
                <input className={fieldClass} readOnly value={inviteUrl} />
              </label>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void onCopyInviteLink()}
              >
                Copy invite link
              </button>
              {copied ? (
                <p aria-live="polite" className="text-sm text-slate-600">
                  Copied
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <nav className="flex flex-wrap gap-4" aria-label="Account">
        <Link className="underline" to="/">
          Back to my groups
        </Link>
      </nav>
    </section>
  )
}

function RequireAuth({
  user,
  children,
}: {
  user: CurrentUser | null | undefined
  children: React.ReactNode
}) {
  if (user === undefined) {
    return <p aria-live="polite">Checking session…</p>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetchCurrentUser().then((current) => {
      if (!cancelled) setUser(current)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogout() {
    try {
      await logoutUser()
    } finally {
      setUser(null)
    }
  }

  return (
    <Shell user={user ?? null} onLogout={() => void handleLogout()}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth user={user}>
              <GroupsPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <RequireAuth user={user}>
              <GroupShellPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/library"
          element={
            <RequireAuth user={user}>
              <LibraryPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/setlists"
          element={
            <RequireAuth user={user}>
              <SetlistListPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/setlists/:setlistId"
          element={
            <RequireAuth user={user}>
              <SetlistDetailPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/events"
          element={
            <RequireAuth user={user}>
              <EventListPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/events/:eventId"
          element={
            <RequireAuth user={user}>
              <EventDetailPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/songs/:songId"
          element={
            <RequireAuth user={user}>
              <SongDetailPage user={user!} />
            </RequireAuth>
          }
        />
        <Route
          path="/groups/:groupId/arrangements/:arrangementId"
          element={
            <RequireAuth user={user}>
              <ArrangementDetailPage user={user!} />
            </RequireAuth>
          }
        />
        <Route path="/join/:token" element={<JoinPage user={user} />} />
        <Route
          path="/login"
          element={<GuestAuthRoute user={user} mode="login" onSuccess={setUser} />}
        />
        <Route
          path="/register"
          element={<GuestAuthRoute user={user} mode="register" onSuccess={setUser} />}
        />
      </Routes>
    </Shell>
  )
}
