'use client'

import { BrowserRouter } from 'react-router-dom'
import App from './App'

/**
 * Bridge mount (parity migration, ADR-0067): runs the ported product SPA inside
 * Next while routes are converted to App Router. Loaded with `ssr: false`
 * because BrowserRouter and several providers are browser-only.
 */
export default function Mount() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}
