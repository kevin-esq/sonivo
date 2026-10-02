import type { ReactNode } from 'react'
import type { CurrentUser } from '../api/client'
import { AppHeader } from './AppHeader'

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
