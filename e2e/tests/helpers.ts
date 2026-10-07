import { expect, type Page } from '@playwright/test'

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

/** Meets Identity password rules (length, upper, lower, digit). */
export const testPassword = 'TestPass1a'

/**
 * T-AU-01 E2E confirmation without a mailbox: the API exposes
 * POST /api/auth/test/confirm only when Auth:EnableTestHook=true
 * (CI + local E2E startup; never prod). Same-origin fetch keeps the
 * browser cookie jar + CSRF flow intact.
 */
export async function testConfirmUser(page: Page, email: string) {
  await page.evaluate(async (targetEmail: string) => {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
    if (!csrfResponse.ok) {
      throw new Error(`csrf failed: ${csrfResponse.status}`)
    }
    const { token } = (await csrfResponse.json()) as { token: string }
    const confirm = await fetch('/api/auth/test/confirm', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ email: targetEmail }),
    })
    if (!confirm.ok) {
      throw new Error(`test-confirm failed: ${confirm.status}`)
    }
  }, email)
}

export async function register(page: Page, email: string, password = testPassword) {
  await page.goto('/register')
  await page.getByLabel('Nombre').fill(email.split('@')[0] ?? 'e2e')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  // T-AU-01: register proves nothing by itself — confirm the mailbox
  // out-of-band, then sign in with the same credentials.
  await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible()
  await testConfirmUser(page, email)
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  // ADR-0053: `/` is the Inicio dashboard; the group list lives at /grupos.
  await page.goto('/grupos')
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

export async function login(page: Page, email: string, password = testPassword) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  await page.goto('/grupos')
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

export async function logout(page: Page) {
  // The group workspace rail no longer carries sign-out (ADR-0055); the account
  // shell does, so navigate there before signing out.
  await page.goto('/cuenta')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
}

export async function createGroup(page: Page, name: string) {
  // La creación vive en un modal desde el refactor de la página de grupos.
  await page.getByRole('button', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre').fill(name)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  // El rol aparece en el rail (marca + tarjeta de usuario); asertamos sobre la marca
  // para evitar la duplicación intencional del texto dentro del landmark complementary.
  await expect(page.getByTestId('rail-brand').getByText('Organizador', { exact: true })).toBeVisible()
}

export async function openLibrary(page: Page) {
  await page.getByTestId('group-rail').getByRole('link', { name: 'Canciones', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
}

/**
 * Drives a group-scoped custom `GroupSelect` (ADR-0074): it renders an ARIA
 * combobox trigger + a listbox, not a native `<select>`, so `selectOption` no
 * longer applies. Opens the combobox by its label and clicks the option.
 */
export async function chooseGroupOption(page: Page, label: string, optionName: string) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

/**
 * Opens a group create dialog and fills one field, retrying the whole
 * open+fill as a unit. React's route transitions can occasionally replace the
 * dialog right as the field is focused, detaching it; retrying absorbs that
 * without weakening the assertion (the value must stick).
 */
async function openCreateDialogAndFill(
  page: Page,
  opts: {
    trigger: string
    heading: string
    label: string
    value: string
    option?: { label: string; name: string }
  },
) {
  await expect(async () => {
    const heading = page.getByRole('heading', { name: opts.heading })
    if (!(await heading.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: opts.trigger }).first().click()
    }
    await expect(heading).toBeVisible({ timeout: 2000 })
    const field = page.getByLabel(opts.label)
    await field.fill(opts.value, { timeout: 3000 })
    await expect(field).toHaveValue(opts.value, { timeout: 2000 })
    if (opts.option) {
      // The custom GroupSelect can be detached by a route-transition re-render
      // too, so selecting the option is part of the retried unit.
      await page.getByRole('combobox', { name: opts.option.label }).click({ timeout: 3000 })
      await page.getByRole('option', { name: opts.option.name, exact: true }).click({ timeout: 3000 })
    }
  }).toPass({ timeout: 30000 })
}

export async function createSong(page: Page, title: string) {
  await openCreateDialogAndFill(page, {
    trigger: 'Agregar canción',
    heading: 'Crear canción',
    label: 'Título',
    value: title,
    option: { label: 'Origen', name: 'Propia' },
  })
  await page.getByRole('button', { name: 'Crear canción' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
}

export async function openSong(page: Page, title: string) {
  await page.getByRole('link', { name: title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

export async function createArrangement(
  page: Page,
  label: string,
  options?: { lyrics?: string; chords?: string; defaultKey?: string; defaultBpm?: string },
) {
  await page.getByRole('button', { name: 'Agregar arreglo' }).click()
  await expect(page.getByRole('heading', { name: 'Crear arreglo' })).toBeVisible()
  await page.getByLabel('Etiqueta', { exact: true }).fill(label)
  if (options?.defaultKey) {
    await page.getByLabel('Tonalidad (opcional)').fill(options.defaultKey)
  }
  if (options?.defaultBpm) {
    await page.getByLabel('Tempo / BPM (opcional, 1–400)').fill(options.defaultBpm)
  }
  if (options?.lyrics) {
    await page.getByLabel('Letra (opcional)').fill(options.lyrics)
  }
  if (options?.chords) {
    await page.getByTestId('arrangement-chords').fill(options.chords)
  }
  await page.getByRole('button', { name: 'Crear arreglo' }).click()
  // Create navigates to the new arrangement detail.
  await expect(page.getByRole('heading', { name: label })).toBeVisible()
}

export async function openPractice(page: Page) {
  await page.getByRole('link', { name: 'Practicar' }).click()
  await expect(page.getByText('Practicar', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Letra' })).toBeVisible()
}

export async function createLinkResource(
  page: Page,
  input: { label: string; url: string; purpose?: string },
) {
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  await expect(page.getByRole('heading', { name: 'Agregar enlace' })).toBeVisible()
  await page.getByLabel('Propósito').selectOption(input.purpose ?? 'practice')
  await page.getByLabel('Etiqueta', { exact: true }).fill(input.label)
  await page.getByLabel('URL').fill(input.url)
  await page.getByRole('button', { name: 'Crear enlace' }).click()
  await expect(page.getByText(input.label, { exact: true })).toBeVisible()
  const link = page.getByRole('link', { name: input.url })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', input.url)
  await expect(link).toHaveAttribute('target', '_blank')
}

export async function createFileResource(
  page: Page,
  input: { label: string; filePath: string; purpose?: string },
) {
  await page.getByRole('button', { name: 'Subir archivo' }).click()
  await expect(page.getByRole('heading', { name: 'Subir archivo' })).toBeVisible()
  await page.getByLabel('Propósito').selectOption(input.purpose ?? 'practice')
  await page.getByLabel('Etiqueta', { exact: true }).fill(input.label)
  await page.getByLabel('Archivo').setInputFiles(input.filePath)
  await page.getByRole('button', { name: 'Subir archivo' }).click()
  const row = page.getByRole('listitem').filter({ hasText: input.label })
  await expect(row.getByText(input.label, { exact: true })).toBeVisible()
  await expect(row.getByRole('link', { name: 'Descargar' })).toBeVisible()
}

export async function deleteSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Eliminar canción' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Eliminar canción?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Eliminar canción' }).click()
  await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
}

export async function openSetlists(page: Page) {
  await page.getByRole('link', { name: 'Listas' }).first().click()
  await expect(page.getByRole('heading', { name: 'Listas' })).toBeVisible()
}

export async function createSetlist(page: Page, name: string) {
  await openCreateDialogAndFill(page, {
    trigger: 'Nueva lista',
    heading: 'Crear lista',
    label: 'Nombre',
    value: name,
  })
  await page.getByRole('button', { name: 'Crear lista' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/** optionLabel is `songTitle — arrangementLabel` from the live-arrangement select. */
export async function addArrangementToSetlist(page: Page, optionLabel: string) {
  const select = page.getByLabel('Arreglo')
  if (!(await select.isVisible())) {
    await page.getByRole('button', { name: 'Agregar a la lista' }).click()
  }
  await select.selectOption({ label: optionLabel })
  await page.getByRole('button', { name: 'Agregar a la lista' }).click()
  const [songTitle, arrangementLabel] = optionLabel.split(' — ')
  let item = page.getByRole('listitem').filter({ hasText: songTitle ?? optionLabel })
  if (arrangementLabel) {
    item = item.filter({ hasText: arrangementLabel })
  }
  await expect(item.last()).toBeVisible()
}

export async function saveSetlistOrder(page: Page) {
  await page.getByRole('button', { name: 'Guardar orden' }).click()
  await expect(page.getByRole('button', { name: 'Guardar orden' })).toBeEnabled()
}

/** Setlist composition rows show song title and arrangement label on separate lines. */
export function setlistItem(page: Page, songTitle: string, arrangementLabel: string) {
  return page
    .getByRole('listitem')
    .filter({ hasText: songTitle })
    .filter({ hasText: arrangementLabel })
}

export async function openEvents(page: Page) {
  await page.getByRole('link', { name: 'Eventos' }).first().click()
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
}

export async function createEvent(
  page: Page,
  input: { title: string; type?: 'rehearsal' | 'performance' | 'other'; startsAt: string },
) {
  const typeOption = { rehearsal: 'Ensayo', performance: 'Concierto', other: 'Otro' }[
    input.type ?? 'rehearsal'
  ]
  await openCreateDialogAndFill(page, {
    trigger: 'Nuevo evento',
    heading: 'Crear evento',
    label: 'Título',
    value: input.title,
    option: { label: 'Tipo', name: typeOption },
  })
  await page.getByLabel('Fecha y hora').fill(input.startsAt)
  await page.getByRole('button', { name: 'Crear evento' }).click()
  await expect(page.getByRole('heading', { name: input.title })).toBeVisible()
}

export async function applySetlist(page: Page) {
  await page.getByRole('button', { name: 'Aplicar lista' }).click()
}

/** Event plan rows show song title and arrangement label on separate lines. */
export function eventPlanItem(page: Page, songTitle: string, arrangementLabel: string) {
  return page
    .getByRole('listitem')
    .filter({ hasText: songTitle })
    .filter({ hasText: arrangementLabel })
}

export async function inviteMemberAndReadLink(page: Page): Promise<string> {
  // The group home now renders "Invitar miembro" twice: a quick action
  // (region "Acciones rápidas") and the actual submit inside the owner
  // "Administrar" section — scope to the latter.
  await page
    .getByRole('region', { name: 'Administrar' })
    .getByRole('button', { name: 'Invitar miembro' })
    .click()
  const inviteLink = page.getByLabel('Enlace de invitación')
  await expect(inviteLink).toBeVisible()
  const url = await inviteLink.inputValue()
  expect(url).toContain('/join/')
  // Path-only so Playwright stays on baseURL host (localhost vs 127.0.0.1 cookie jar).
  return new URL(url, page.url()).pathname
}

export async function acceptInvite(page: Page) {
  await expect(page).toHaveURL(/\/join\//)
  await expect(page.getByText('Comprobando sesión…')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Unirte a este grupo' })).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
}

export async function openPeople(page: Page) {
  await page.getByRole('link', { name: 'Miembros' }).click()
  await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
}

export function attendanceRegion(page: Page) {
  return page.getByRole('region', { name: 'Asistencia' })
}

export async function setRsvpYes(page: Page) {
  const attendance = attendanceRegion(page)
  await expect(attendance).toBeVisible()
  await attendance.getByRole('button', { name: 'Sí' }).click()
  await expect(attendance.getByRole('button', { name: 'Sí' })).toHaveAttribute('aria-pressed', 'true')
}
