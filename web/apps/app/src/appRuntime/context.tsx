'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ThemeProvider } from '../brand/theme'
import { LanguageProvider } from '../i18n'
import { useAppSession } from './session'
import { AudioPlayerProvider } from '../repertoire/AudioPlayerContext'
import { RailPresenceProvider } from '../shell/railPresence'
import { ToastProvider } from '../ui/toast'
import { LogoutConfirmationDialog } from '../shell/LogoutConfirmationDialog'

type AppRuntime = ReturnType<typeof useAppSession>

const AppRuntimeContext = createContext<AppRuntime | null>(null)

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useAppSession()
  const [logoutRequested, setLogoutRequested] = useState(false)
  const requestLogout = useCallback(() => setLogoutRequested(true), [])
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppRuntimeContext.Provider value={{ ...runtime, onLogout: requestLogout }}>
          <RailPresenceProvider>
            <AudioPlayerProvider>
              <ToastProvider>
                {children}
                <LogoutConfirmationDialog
                  open={logoutRequested && runtime.session.status === 'authenticated'}
                  onCancel={() => setLogoutRequested(false)}
                  onConfirm={() => {
                    setLogoutRequested(false)
                    runtime.onLogout()
                  }}
                />
              </ToastProvider>
            </AudioPlayerProvider>
          </RailPresenceProvider>
        </AppRuntimeContext.Provider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

export function useAppRuntime(): AppRuntime {
  const runtime = useContext(AppRuntimeContext)
  if (!runtime) throw new Error('AppRuntimeProvider is missing')
  return runtime
}
