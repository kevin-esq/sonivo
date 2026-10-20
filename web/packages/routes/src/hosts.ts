export const surfaceHosts = {
  marketing: 'sonivo.lat',
  identity: 'auth.sonivo.lat',
  product: 'app.sonivo.lat',
} as const

export type WebSurface = keyof typeof surfaceHosts

/** Build a fixed-surface absolute URL without accepting arbitrary redirect hosts. */
export function surfaceUrl(surface: WebSurface, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new TypeError('A surface URL must use a local absolute path.')
  }

  const url = new URL(path, `https://${surfaceHosts[surface]}`)
  if (url.protocol !== 'https:' || url.hostname !== surfaceHosts[surface]) {
    throw new TypeError('A surface URL must stay on its configured host.')
  }
  return url.toString()
}
