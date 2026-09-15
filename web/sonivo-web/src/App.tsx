import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  createGroup,
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

function Shell({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser | null
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="border-b border-slate-300 pb-4">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Sonivo</p>
        <h1 className="mt-2 text-3xl font-semibold">Groups</h1>
        <p className="mt-2 text-slate-600">
          Create and select a musical group. Later features stay out of this slice.
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
              <Link className="underline" to="/login">
                Log in
              </Link>
              <Link className="underline" to="/register">
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
      navigate('/')
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
    </form>
  )
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!groupId) return
      setGroup(undefined)
      setError(null)
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
      <p className="text-slate-600">
        Repertoire, setlists, and events are not part of this phase.
      </p>
      <Link className="underline" to="/">
        Back to my groups
      </Link>
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
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthForm mode="login" onSuccess={setUser} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthForm mode="register" onSuccess={setUser} />
            )
          }
        />
      </Routes>
    </Shell>
  )
}
