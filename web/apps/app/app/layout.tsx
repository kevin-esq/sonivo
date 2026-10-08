import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sonivo',
  description: 'Group music management.',
  icons: { icon: '/favicon.svg' },
}

/**
 * Root layout. Static so the app can be exported for the single-origin .NET host.
 * Theme and group branding are applied client-side by the ported providers, as
 * in the previous Vite shell.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Pre-paint theme: apply the stored choice before first paint so a light
            user never sees the default dark frame flash (Sonivo, premium feel).
            Kept inline and dependency-free; the provider re-applies after mount. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;var t=localStorage.getItem('sonivo:theme');if(t==='light'||t==='dark'){d.dataset.theme=t}var m=location.pathname.match(/^\\/groups\\/([^/]+)/);if(m){var raw=localStorage.getItem('sonivo:group-tokens:'+decodeURIComponent(m[1]));if(raw){var tk=JSON.parse(raw);for(var k in tk){if(Object.prototype.hasOwnProperty.call(tk,k)){d.style.setProperty(k,tk[k])}}}}}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;600;700&family=DM+Sans:wght@400;600;700&family=Poppins:wght@400;600;700&family=Nunito:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&family=Source+Serif+4:wght@400;600;700&family=Lora:wght@400;600;700&family=Playfair+Display:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
