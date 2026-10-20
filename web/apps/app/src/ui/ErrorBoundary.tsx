import { routes } from '../routing/routes'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { reportClientError } from '../diagnostics/clientTelemetry'
import { useT } from '../i18n'
import { Button } from './button'
import { cn } from './cn'

/**
 * Contained error surface for a broken region (typically one route).
 *
 * The app also has a full-screen boundary as a last resort. This one is used
 * around page content so that a failure in a single tab does not take the whole
 * workspace down: the shell, sidebar and navigation stay alive, the user keeps a
 * way back, and the error is bounded to the area that actually broke.
 */
export function SectionErrorFallback({ className }: { className?: string }) {
  const { t } = useT()
  return (
    <div
      role="alert"
      data-testid="section-error"
      className={cn(
        'flex flex-col items-center gap-5 rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span
        className="grid h-14 w-14 place-items-center rounded-2xl bg-error/15 text-error-ink"
        aria-hidden="true"
      >
        <TriangleAlert className="h-7 w-7" />
      </span>
      <div className="space-y-1.5">
        <h2 className="text-lg font-bold tracking-tight text-ink">{t('state.sectionErrorTitle')}</h2>
        <p className="mx-auto max-w-md text-sm text-muted">{t('state.sectionErrorBody')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t('state.reload')}
        </Button>
        <Link to={routes.home} className={cn('text-sm font-semibold text-primary-ink no-underline hover:underline')}>
          {t('state.backHome')}
        </Link>
      </div>
    </div>
  )
}

type ErrorBoundaryProps = {
  children: ReactNode
  /**
   * Changing this value clears a previous failure, so the boundary is reused
   * across navigations instead of latching onto the first broken screen.
   */
  resetKey?: string
  /** Extra class for the fallback surface (e.g. vertical padding per region). */
  className?: string
}

type ErrorBoundaryState = { failed: boolean }

/**
 * Render-error boundary. Keeps its subtree's failure local: the error is
 * reported for observability and the contained fallback is shown, while
 * everything rendered outside this boundary keeps working.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack)
    reportClientError({
      source: 'react',
      message: error.message || String(error),
      stack: error.stack,
    })
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    // Navigating to another screen retries the region with a clean slate.
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <SectionErrorFallback className={this.props.className} />
  }
}
