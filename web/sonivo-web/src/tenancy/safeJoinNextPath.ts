const JOIN_NEXT_PATH = /^\/join\/[A-Za-z0-9._~-]+$/

/** Allowlisted post-auth return paths (invite join). Rejects absolute/external URLs. */
export function safeJoinNextPath(value: string | null | undefined): string | null {
  if (!value) return null
  if (!JOIN_NEXT_PATH.test(value)) return null
  return value
}
