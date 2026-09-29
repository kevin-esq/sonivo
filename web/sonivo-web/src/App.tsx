import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { fetchCurrentUser, logoutUser, type CurrentUser } from './api/client'
import { GroupsPage } from './groups/GroupsPage'
import { GroupHomePage } from './groups/GroupHomePage'
import { ArrangementDetailPage } from './repertoire/ArrangementDetailPage'
import { LibraryPage } from './repertoire/LibraryPage'
import { PracticePage } from './repertoire/PracticePage'
import { SongDetailPage } from './repertoire/SongDetailPage'
import { EventDetailPage } from './scheduling/EventDetailPage'
import { EventListPage } from './scheduling/EventListPage'
import { SetlistDetailPage } from './scheduling/SetlistDetailPage'
import { SetlistListPage } from './scheduling/SetlistListPage'
import { GuestAuthRoute } from './shell/AuthScreen'
import { SecurityPage } from './shell/SecurityPage'
import { ConfirmPage, ForgotPasswordPage, ResetPasswordPage } from './shell/VerifyPages'
import { GroupsChrome, PublicChrome, SessionScreen } from './shell/GroupsChrome'
import { GroupWorkspace } from './shell/GroupWorkspace'
import { JoinPage } from './tenancy/JoinPage'
import { PeoplePage } from './tenancy/PeoplePage'

import { AudioPlayerProvider } from './repertoire/AudioPlayerContext'
import { PersistentGlobalPlayer } from './shell/PersistentGlobalPlayer'
import { SettingsLayout } from './shell/settings/SettingsLayout'
import { SettingsProfilePage, SettingsTeamPage } from './shell/settings/SettingsPages'

function RequireAuth({
  user,
  children,
}: {
  user: CurrentUser | null | undefined
  children: React.ReactNode
}) {
  if (user === undefined) {
    return <SessionScreen message="Comprobando sesión…" />
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return children
}

function GroupRoute({
  user,
  onLogout,
  children,
}: {
  user: CurrentUser
  onLogout: () => void
  children: React.ReactNode
}) {
  return (
    <GroupWorkspace user={user} onLogout={onLogout}>
      {children}
    </GroupWorkspace>
  )
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

  const onLogout = () => void handleLogout()

  return (
    <AudioPlayerProvider>
      <Routes>
      <Route
        path="/"
        element={
          <RequireAuth user={user}>
            <GroupsChrome user={user!} onLogout={onLogout}>
              <GroupsPage user={user!} />
            </GroupsChrome>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <GroupHomePage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/library"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <LibraryPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/setlists"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <SetlistListPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/setlists/:setlistId"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <SetlistDetailPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/events"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <EventListPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/people"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <PeoplePage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/events/:eventId"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <EventDetailPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/songs/:songId"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <SongDetailPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/arrangements/:arrangementId"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <ArrangementDetailPage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId/arrangements/:arrangementId/practice"
        element={
          <RequireAuth user={user}>
            <GroupRoute user={user!} onLogout={onLogout}>
              <PracticePage user={user!} />
            </GroupRoute>
          </RequireAuth>
        }
      />
      <Route
        path="/join/:token"
        element={
          <PublicChrome user={user ?? null}>
            <JoinPage user={user} />
          </PublicChrome>
        }
      />
      <Route
        path="/login"
        element={<GuestAuthRoute user={user} mode="login" onSuccess={setUser} />}
      />
      <Route
        path="/register"
        element={<GuestAuthRoute user={user} mode="register" onSuccess={setUser} />}
      />
      <Route path="/confirm" element={<ConfirmPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/security" element={<Navigate to="/settings/security" replace />} />
      <Route
        path="/settings"
        element={
          <RequireAuth user={user}>
            <GroupsChrome user={user!} onLogout={onLogout}>
              <SettingsLayout />
            </GroupsChrome>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/settings/profile" replace />} />
        <Route path="profile" element={<SettingsProfilePage user={user!} />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="team" element={<SettingsTeamPage />} />
      </Route>
    </Routes>
    <PersistentGlobalPlayer />
    </AudioPlayerProvider>
  )
}
