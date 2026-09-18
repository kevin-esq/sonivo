import { expect, type Page } from '@playwright/test'

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

/** Meets Identity password rules (length, upper, lower, digit). */
export const testPassword = 'TestPass1a'

export async function register(page: Page, email: string, password = testPassword) {
  await page.goto('/register')
  await page.getByLabel('Nombre').fill(email.split('@')[0] ?? 'e2e')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
}

export async function login(page: Page, email: string, password = testPassword) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
}

export async function createGroup(page: Page, name: string) {
  await page.getByLabel('Nombre').fill(name)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByRole('complementary').getByText('Organizador', { exact: true })).toBeVisible()
}

export async function openLibrary(page: Page) {
  await page.getByRole('link', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
}

export async function createSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Agregar canción' }).click()
  await expect(page.getByRole('heading', { name: 'Crear canción' })).toBeVisible()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Origen').selectOption('original')
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
  options?: { lyrics?: string; defaultKey?: string; defaultBpm?: string },
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
  await expect(page.getByText(input.label, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Descargar' })).toBeVisible()
}

export async function deleteSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Eliminar canción' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Eliminar canción?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Eliminar canción' }).click()
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
}

export async function openSetlists(page: Page) {
  await page.getByRole('link', { name: 'Listas' }).first().click()
  await expect(page.getByRole('heading', { name: 'Listas' })).toBeVisible()
}

export async function createSetlist(page: Page, name: string) {
  await page.getByRole('button', { name: 'Nueva lista' }).click()
  await expect(page.getByRole('heading', { name: 'Crear lista' })).toBeVisible()
  await page.getByLabel('Nombre').fill(name)
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
  await page.getByRole('button', { name: 'Nuevo evento' }).click()
  await expect(page.getByRole('heading', { name: 'Crear evento' })).toBeVisible()
  await page.getByLabel('Título').fill(input.title)
  await page.getByLabel('Tipo').selectOption(input.type ?? 'rehearsal')
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
  await page.getByRole('button', { name: 'Invitar miembro' }).click()
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
