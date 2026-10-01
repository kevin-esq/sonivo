import type { ReactNode } from 'react'
import type { CurrentUser } from '../api/client'
import { AppHeader } from './AppHeader'

/**
 * Chrome for the signed-in, non-group pages (My groups, account is separate).
 * The old white panel was removed in W1: content sits on the canvas and only
 * cards carry their own surface, aligned with the header container.
 */
export function GroupsChrome({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader user={user} onLogout={onLogout} />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl px-4 py-8 text-ink sm:px-6 sm:py-10"
      >
        {children}
      </main>
    </div>
  )
}

export function PublicChrome({
  children,
  user,
}: {
  children: ReactNode
  user?: CurrentUser | null
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader user={user ?? null} />
      <main id="main" className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6">
        <div className="rounded-2xl bg-surface p-6 text-ink shadow-sm">
          {children}
        </div>
      </main>
    </div>
  )
}

export function SessionScreen({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-shell-foreground">
      <p aria-live="polite">{message}</p>
    </div>
  )
}
