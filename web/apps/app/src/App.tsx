import { useAppRuntime } from './appRuntime/context'
import { AppRouter } from './AppRouter'
import { AuthenticatedPlayer } from './shell/AuthenticatedPlayer'
import { ErrorBoundary } from './ui/ErrorBoundary'

export default function App() {
  const {
    session,
    user,
    guestUser,
    onLogout,
    onRetry,
    onUserChange,
    onAuthSuccess,
  } = useAppRuntime()

  return (
    <ErrorBoundary>
      <AppRouter
        session={session}
        user={user}
        guestUser={guestUser}
        onLogout={onLogout}
        onRetry={onRetry}
        onUserChange={onUserChange}
        onAuthSuccess={onAuthSuccess}
      />
      <AuthenticatedPlayer active={session.status === 'authenticated'} />
    </ErrorBoundary>
  )
}
