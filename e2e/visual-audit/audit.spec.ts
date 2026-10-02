import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * FASE 2 — guided walkthrough of every primary and secondary flow.
 *
 * For each screen it captures a full-page and a viewport screenshot, runs axe
 * (WCAG 2.x rule engine) and records layout metrics (overflow, touch targets,
 * heading order, gradient surfaces, computed contrast for key text).
 *
 * Evidence is written to `.visual-audit/<project>/` as PNGs plus a single
 * `evidence.json` that FASE 3 reads.
 */

const ROOT = join(process.cwd(), '..', '.visual-audit')
const PASSWORD = 'TestPass1a'

type Evidence = {
  viewport: string
  width: number
  screen: string
  url: string
  overflow: { scrollWidth: number; clientWidth: number; offenders: string[] }
  smallTargets: { count: number; sample: string[] }
  headings: string[]
  gradientSurfaces: string[]
  touches: number
  axe: {
    violations: number
    byImpact: Record<string, number>
    top: string[]
    nodes?: Array<{ id: string; impact?: string; target: string; summary: string }>
  } | { error: string }
  notes?: string
}

function evidencePath(project: string): string {
  const dir = join(ROOT, project)
  mkdirSync(dir, { recursive: true })
  return dir
}

async function collectMetrics(page: Page): Promise<Omit<Evidence, 'viewport' | 'width' | 'screen' | 'url' | 'axe'>> {
  return page.evaluate(() => {
    const de = document.documentElement
    const offenders = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > window.innerWidth + 1
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 48)}`)

    const small: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, [role="button"]'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 44 || r.width < 44) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('type') || '').trim().slice(0, 28)
        small.push(`${el.tagName.toLowerCase()}[${label}] ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }

    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(
      (h) => `${h.tagName.toLowerCase()}: ${(h.textContent || '').trim().slice(0, 44)}`,
    )

    const gradientSurfaces = Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => {
        const bi = getComputedStyle(el).backgroundImage
        return bi && bi.includes('linear-gradient')
      })
      .slice(0, 8)
      .map((el) => el.getAttribute('data-testid') || `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 32)}`)

    return {
      overflow: { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders },
      smallTargets: { count: small.length, sample: small.slice(0, 10) },
      headings,
      gradientSurfaces,
      touches: document.querySelectorAll('bit-notification-bar-root').length,
    }
  })
}

async function audit(
  page: Page,
  project: string,
  screen: string,
  opts: { axe?: boolean; note?: string; full?: boolean } = {},
): Promise<Evidence> {
  const dir = evidencePath(project)
  const store = evidenceStore(project)
  const index = String(store.length + 1).padStart(2, '0')
  const slug = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  await page.screenshot({ path: join(dir, `${index}-${slug}.png`), fullPage: opts.full !== false })
  await page.screenshot({ path: join(dir, `${index}-${slug}--viewport.png`) })

  const metrics = await collectMetrics(page)

  let axe: Evidence['axe'] = { violations: 0, byImpact: {}, top: [] }
  if (opts.axe !== false) {
    try {
      const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      const byImpact: Record<string, number> = {}
      for (const v of res.violations) byImpact[v.impact ?? 'unknown'] = (byImpact[v.impact ?? 'unknown'] ?? 0) + 1
      const nodes = res.violations.flatMap((v) =>
        v.nodes.slice(0, 12).map((n) => ({
          id: v.id,
          impact: v.impact ?? undefined,
          target: Array.isArray(n.target) ? n.target.join(' ') : String(n.target),
          summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220),
        })),
      )
      axe = {
        violations: res.violations.length,
        byImpact,
        top: res.violations.slice(0, 6).map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}`),
        nodes,
      }
    } catch (err) {
      axe = { error: String((err as Error).message).slice(0, 160) }
    }
  }

  const evidence: Evidence = {
    viewport: project,
    width: page.viewportSize()?.width ?? 0,
    screen,
    url: page.url(),
    ...metrics,
    axe,
    notes: opts.note,
  }
  store.push(evidence)
  return evidence
}

/* per-project evidence store (module state, single worker) */
const stores = new Map<string, Evidence[]>()
function evidenceStore(project: string): Evidence[] {
  if (!stores.has(project)) stores.set(project, [])
  return stores.get(project)!
}

/** Records a navigation gap (a flow that cannot be reached at this viewport) as evidence. */
async function recordGap(page: Page, project: string, screen: string, note: string): Promise<void> {
  const dir = evidencePath(project)
  const store = evidenceStore(project)
  const index = String(store.length + 1).padStart(2, '0')
  const slug = screen.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  await page.screenshot({ path: join(dir, `${index}-${slug}--viewport.png`) })
  store.push({
    viewport: project,
    width: page.viewportSize()?.width ?? 0,
    screen,
    url: page.url(),
    overflow: { scrollWidth: 0, clientWidth: 0, offenders: [] },
    smallTargets: { count: 0, sample: [] },
    headings: [],
    gradientSurfaces: [],
    touches: 0,
    axe: { violations: 0, byImpact: {}, top: [] },
    notes: `NAV GAP: ${note}`,
  })
}

test.describe('Sonivo visual/UX audit', () => {
  test('walkthrough + evidence', async ({ page }, testInfo) => {
    const project = testInfo.project.name
    const stamp = Date.now()
    const email = `audit-${project}-${stamp}@example.com`
    const groupName = `Auditoría ${project} ${stamp}`
    const songTitle = 'Gracias'
    const arrangementLabel = 'Versión acústica'
    const setlistName = 'Ensayo del jueves'
    const eventTitle = 'Ensayo general'

    const kill = async () => {
      await page.evaluate(() => {
        document.querySelectorAll('bit-notification-bar-root').forEach((e) => e.remove())
      })
    }
    const go = async (path: string) => {
      await page.goto(path)
      await kill()
    }

    /* ---------- auth ---------- */
    await go('/register')
    await audit(page, project, 'auth-register-empty', { note: 'estado vacío del alta' })

    await go('/register')
    await page.getByLabel('Nombre').fill('Ana Directora')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(PASSWORD)
    await audit(page, project, 'auth-register-filled')

    await page.getByRole('button', { name: 'Registrarse' }).click()
    await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible()
    await audit(page, project, 'auth-register-confirmation')

    /* ---------- confirm + login ---------- */
    const csrf = await page.evaluate(async () => {
      const r = await fetch('/api/auth/csrf', { credentials: 'include' })
      return (await r.json()).token as string
    })
    await page.evaluate(
      async ([token, target]) => {
        await fetch('/api/auth/test/confirm', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
          body: JSON.stringify({ email: target }),
        })
      },
      [csrf, email] as const,
    )

    await go('/login')
    await audit(page, project, 'auth-login-empty')

    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill('ClaveIncorrecta9')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await audit(page, project, 'auth-login-error', { note: 'estado de error de credenciales' })

    await page.getByLabel('Contraseña').fill(PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
    await audit(page, project, 'groups-empty', { note: 'mis grupos sin datos' })

    /* ---------- group ---------- */
    await page.getByLabel('Nombre').fill(groupName)
    await page.getByRole('button', { name: 'Crear grupo' }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await kill()
    await audit(page, project, 'group-home-empty', { note: 'inicio de grupo recién creado' })

    /* ---------- library ---------- */
    await page.getByRole('link', { name: 'Biblioteca', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
    await kill()
    await audit(page, project, 'library-empty')

    await page.getByRole('button', { name: 'Agregar canción' }).click()
    await expect(page.getByRole('heading', { name: 'Crear canción' })).toBeVisible()
    await kill()
    await audit(page, project, 'library-create-song-modal')

    await page.getByLabel('Título').fill(songTitle)
    await page.getByLabel('Origen').selectOption('original')
    await kill()
    await page.getByRole('button', { name: 'Crear canción' }).click()
    await expect(page.getByRole('link', { name: songTitle })).toBeVisible()
    await audit(page, project, 'library-with-song')

    await page.getByTestId('library-search').fill('zzz-sin-coincidencias')
    await expect(page.getByText('Sin resultados para esta búsqueda')).toBeVisible()
    await audit(page, project, 'library-search-no-results')

    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
    await expect(page.getByRole('link', { name: songTitle })).toBeVisible()

    /* ---------- song ---------- */
    await page.getByRole('link', { name: songTitle }).click()
    await expect(page.getByRole('heading', { name: songTitle })).toBeVisible()
    await kill()
    await audit(page, project, 'song-detail-no-arrangements')

    await page.getByRole('button', { name: 'Agregar arreglo' }).click()
    await expect(page.getByRole('heading', { name: 'Crear arreglo' })).toBeVisible()
    await page.getByLabel('Etiqueta', { exact: true }).fill(arrangementLabel)
    await page.getByLabel('Tonalidad (opcional)').fill('G')
    await page.getByLabel('Tempo / BPM (opcional, 1–400)').fill('96')
    await page.getByLabel('Letra (opcional)').fill('Gracias por tanto amor\nGracias por la vida')
    await page.getByTestId('arrangement-chords').fill('{title: Gracias}\n{start_of_verse}\n[C]Gracias por tanto [G]amor')
    await kill()
    await audit(page, project, 'song-create-arrangement-modal')

    await page.getByRole('button', { name: 'Crear arreglo' }).click()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()
    await kill()
    await audit(page, project, 'arrangement-detail')

    await page.getByRole('button', { name: 'Agregar enlace' }).click()
    await expect(page.getByRole('heading', { name: 'Agregar enlace' })).toBeVisible()
    await page.getByLabel('Propósito').selectOption('chart')
    await page.getByLabel('Etiqueta', { exact: true }).fill('Partitura oficial')
    await page.getByLabel('URL').fill('https://example.com/partituras/gracias.pdf')
    await kill()
    await page.getByRole('button', { name: 'Crear enlace' }).click()
    await page.getByText('Partitura oficial', { exact: true }).waitFor()
    await kill()
    await audit(page, project, 'arrangement-with-resource')

    /* ---------- focus + hover states ---------- */
    await page.getByRole('button', { name: 'Editar arreglo' }).focus()
    await audit(page, project, 'arrangement-focus-state', { axe: false, note: 'foco de teclado' })

    /* ---------- practice ---------- */
    await page.getByRole('link', { name: 'Practicar' }).click()
    await page.getByTestId('practice-tab-estudiar').waitFor()
    await kill()
    await audit(page, project, 'practice-estudiar')

    await page.getByTestId('practice-tab-avanzado').click()
    await kill()
    await audit(page, project, 'practice-avanzado')

    await page.getByTestId('practice-tab-afinar').click()
    await page.getByTestId('tuner-panel').waitFor()
    await kill()
    await audit(page, project, 'practice-afinar')

    /* ---------- setlists ---------- */
    await page.getByRole('link', { name: 'Listas' }).first().click()
    await expect(page.getByRole('heading', { name: 'Listas' })).toBeVisible()
    await kill()
    await audit(page, project, 'setlists-empty')

    await page.getByRole('button', { name: 'Nueva lista' }).click()
    await expect(page.getByRole('heading', { name: 'Crear lista' })).toBeVisible()
    await page.getByLabel('Nombre').fill(setlistName)
    await kill()
    await page.getByRole('button', { name: 'Crear lista' }).click()
    await expect(page.getByRole('heading', { name: setlistName })).toBeVisible()
    await kill()
    await audit(page, project, 'setlist-detail-empty')

    const arrangementSelect = page.getByLabel('Arreglo')
    if (!(await arrangementSelect.isVisible())) {
      await page.getByRole('button', { name: 'Agregar a la lista' }).click()
    }
    await arrangementSelect.selectOption({ label: `${songTitle} — ${arrangementLabel}` })
    await kill()
    await page.getByRole('button', { name: 'Agregar a la lista' }).click()
    await page.getByRole('button', { name: 'Guardar orden' }).click()
    await kill()
    await audit(page, project, 'setlist-detail-with-item')

    /* ---------- events ---------- */
    await page.getByRole('link', { name: 'Eventos' }).first().click()
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    await kill()
    await audit(page, project, 'events-empty')

    await page.getByRole('button', { name: 'Nuevo evento' }).click()
    await expect(page.getByRole('heading', { name: 'Crear evento' })).toBeVisible()
    await page.getByLabel('Título').fill(eventTitle)
    await page.getByLabel('Tipo').selectOption('rehearsal')
    await page.getByLabel('Fecha y hora').fill('2026-10-15T19:30')
    await kill()
    await page.getByRole('button', { name: 'Crear evento' }).click()
    await expect(page.getByRole('heading', { name: eventTitle })).toBeVisible()
    await kill()
    await audit(page, project, 'event-detail-draft')

    await page.getByRole('button', { name: 'Aplicar lista' }).click()
    await page.getByTestId('event-status-chip').waitFor()
    await kill()
    await audit(page, project, 'event-detail-plan-applied')

    /* ---------- people + invite ---------- */
    const peopleLink = page.getByRole('link', { name: 'Miembros' }).first()
    const peopleReachable = (await peopleLink.count()) > 0 && (await peopleLink.isVisible().catch(() => false))
    if (peopleReachable) {
      await peopleLink.click()
      await page.getByRole('heading', { name: 'Miembros' }).waitFor()
      await kill()
      await audit(page, project, 'people-roster')
    } else {
      await recordGap(page, project, 'people-roster', 'sin enlace visible a Miembros en este viewport')
    }

    await page.getByRole('link', { name: 'Inicio' }).first().click()
    await page.getByRole('heading', { name: groupName }).waitFor()
    await page.getByRole('button', { name: 'Invitar miembro' }).click()
    await page.getByLabel('Enlace de invitación').waitFor()
    await kill()
    await audit(page, project, 'group-home-with-invite')

    /* ---------- group settings ---------- */
    const settingsLink = page.getByRole('link', { name: 'Ajustes del grupo' }).first()
    if ((await settingsLink.count()) > 0 && (await settingsLink.isVisible().catch(() => false))) {
      await settingsLink.click()
      await page.getByRole('heading', { name: 'Ajustes del grupo' }).waitFor()
      await kill()
      await audit(page, project, 'group-settings')
    } else {
      await recordGap(page, project, 'group-settings', 'sin enlace visible a Ajustes del grupo en este viewport')
    }

    /* ---------- account ---------- */
    await go('/cuenta')
    await page.getByRole('heading', { name: 'Cuenta', exact: true }).waitFor()
    await kill()
    await audit(page, project, 'account-profile')

    await go('/cuenta/preferencias')
    await kill()
    await audit(page, project, 'account-preferences-dark')

    const lightBtn = page.getByRole('button', { name: /^(Claro|Light)$/ })
    if (await lightBtn.count()) {
      await lightBtn.first().click()
      await kill()
      await audit(page, project, 'account-preferences-light')
    }

    await go('/cuenta/seguridad')
    await kill()
    await audit(page, project, 'account-security-light')

    /* ---------- light theme on the group surfaces ---------- */
    await go('/')
    await kill()
    await audit(page, project, 'groups-light')

    /* ---------- 404 + session error ---------- */
    await go('/ruta-inexistente-para-auditoria')
    await kill()
    await audit(page, project, 'not-found')

    /* ---------- back to dark for cleanliness ---------- */
    await go('/cuenta/preferencias')
    await kill()
    const darkBtn = page.getByRole('button', { name: /^(Oscuro|Dark)$/ })
    if (await darkBtn.count()) await darkBtn.first().click()

    /* ---------- persist evidence ---------- */
    const dir = evidencePath(project)
    writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidenceStore(project), null, 2), 'utf8')
  })
})
