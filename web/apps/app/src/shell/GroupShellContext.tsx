'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { CurrentUser } from '../api/client'

export type GroupShellRuntime = {
  groupId: string
  pathname: string
  search: string
  user: CurrentUser
  navigate: (to: string, options?: { replace?: boolean }) => void
  navigationMode: 'legacy' | 'next'
}

const GroupShellContext = createContext<GroupShellRuntime | null>(null)

export function GroupShellProvider({ value, children }: { value: GroupShellRuntime; children: ReactNode }) {
  return <GroupShellContext.Provider value={value}>{children}</GroupShellContext.Provider>
}

export function useGroupShellIsProvidedByNext() {
  return useContext(GroupShellContext)?.navigationMode === 'next'
}

export function useGroupShell() {
  const runtime = useContext(GroupShellContext)
  if (!runtime) throw new Error('Group page rendered outside the Group workspace.')
  return runtime
}
