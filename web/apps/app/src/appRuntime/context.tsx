'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ThemeProvider } from '../brand/theme'
import { LanguageProvider } from '../i18n'
import { useAppSession } from './session'
import { AudioPlayerProvider } from '../repertoire/AudioPlayerContext'
import { RailPresenceProvider } from '../shell/railPresence'
import { ToastProvider } from '../ui/toast'

type AppRuntime = ReturnType<typeof useAppSession>

const AppRuntimeContext = createContext<AppRuntime | null>(null)

export function AppRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useAppSession()
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppRuntimeContext.Provider value={runtime}>
          <RailPresenceProvider>
            <AudioPlayerProvider>
              <ToastProvider>{children}</ToastProvider>
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
