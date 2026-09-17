import { Link } from 'react-router-dom'
import { BrandLockup } from '../brand/SonivoMark'
import type { CurrentUser } from '../api/client'
import { Button } from '../ui/button'

export function GroupsChrome({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-4">
          <BrandLockup to="/" light />
          <p className="hidden text-sm text-slate-400 sm:block">Plan. Play. Together.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-300">{user.email}</span>
          <Button variant="ghost" className="text-secondary hover:text-white" onClick={onLogout}>
            Cerrar sesión
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="rounded-2xl bg-white p-6 text-neutral-dark shadow-sm">{children}</div>
      </main>
    </div>
  )
}

export function PublicChrome({
  children,
  user,
}: {
  children: React.ReactNode
  user?: CurrentUser | null
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandLockup to={user ? '/' : '/login'} light />
        {user ? null : (
          <Link
            to="/login"
            className="text-sm font-semibold text-secondary no-underline hover:underline"
          >
            Iniciar sesión
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-lg px-6 py-8">
        <div className="rounded-2xl bg-white p-6 text-neutral-dark shadow-sm">{children}</div>
      </main>
    </div>
  )
}

export function SessionScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-neutral-light">
      <p aria-live="polite">{message}</p>
    </div>
  )
}
