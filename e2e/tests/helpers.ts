import { expect, type Page } from '@playwright/test'
import path from 'node:path'

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
  await page.getByLabel(/Correo/).fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  // T-AU-01: register proves nothing by itself — confirm the mailbox
  // out-of-band, then sign in with the same credentials.
  // The API can be briefly unavailable while CI boots (or when it restarts
  // mid-run), so the confirmation render is retried instead of failing.
  await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible({
    timeout: 30_000,
  })
  await testConfirmUser(page, email)
  await page.goto('/login')
  await page.getByLabel(/Correo/).fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  // ADR-0053: `/` is the public marketing landing; the dashboard lives at /home
// and the group list at /groups.
  await page.goto('/groups')
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

export async function login(page: Page, email: string, password = testPassword) {
  await page.goto('/login')
  await page.getByLabel(/Correo/).fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  await page.goto('/groups')
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

export async function logout(page: Page) {
  // The group workspace rail no longer carries sign-out (ADR-0055); the account
  // shell does, so navigate there before signing out.
  await page.goto('/account')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.getByRole('dialog', { name: '¿Quieres cerrar sesión?' }).getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
}

export async function createGroup(page: Page, name: string) {
  // Creation lives in a modal since the groups page refactor.
  await page.getByRole('button', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre').fill(name)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  // The role shows in the rail (brand + user card); assert on the brand to avoid
  // the intentional duplication of the text inside the complementary landmark.
  await expect(page.getByTestId('rail-brand').getByText('Organizador', { exact: true })).toBeVisible()
}

export async function openLibrary(page: Page) {
  await page.getByTestId('group-rail').getByRole('link', { name: 'Canciones', exact: true }).click()
  // Wait for Next to commit the catch-all Group route before treating the
  // library as ready. The shell can retain matching labels while navigation
  // is still in flight, which otherwise lets modal flows race a route change.
  await expect(page).toHaveURL(/\/library(?:[?#]|$)/)
  await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
  await expect(page.getByTestId('library-hero')).toBeVisible()
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
      const select = page.getByRole('combobox', { name: opts.option.label })
      await select.click({ timeout: 3000 })
      await page.getByRole('option', { name: opts.option.name, exact: true }).click({ timeout: 3000 })
    }
  }).toPass({ timeout: 30000 })
}

export async function createSong(page: Page, title: string) {
  // The create-song flow is a wizard: Details → Audio → Version → Review.
  // The whole run is retried as one unit so a mid-flight re-render cannot leave
  // the dialog half-filled.
  await expect(async () => {
    const dialog = page.getByRole('dialog')
    if (!(await dialog.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Agregar canción' }).first().click()
    }
    await expect(dialog).toBeVisible({ timeout: 2000 })
    await dialog.getByLabel('Título').fill(title, { timeout: 3000 })
    await dialog.getByRole('button', { name: 'Continuar' }).click({ timeout: 3000 })
    await dialog.getByRole('button', { name: 'Omitir audio' }).click({ timeout: 3000 })
    await dialog.getByRole('button', { name: 'Continuar' }).click({ timeout: 3000 })
    await dialog.getByRole('button', { name: 'Crear canción' }).click({ timeout: 3000 })
    await dialog.getByRole('link', { name: 'Abrir canción' }).click({ timeout: 5000 })
  }).toPass({ timeout: 30000 })
  await page.getByTestId('group-rail').getByRole('link', { name: 'Canciones', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
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
  await page.getByRole('button', { name: 'Agregar versión' }).click()
  await expect(page.getByRole('heading', { name: 'Crear versión' })).toBeVisible()
  await page.getByLabel('Nombre de la versión', { exact: true }).fill(label)
  if (options?.defaultKey) {
    await page.getByRole('button', { name: 'Agregar tono y velocidad (opcional)' }).click()
    await page.getByLabel('Tono (opcional)').fill(options.defaultKey)
  }
  if (options?.defaultBpm) {
    if (!options.defaultKey) await page.getByRole('button', { name: 'Agregar tono y velocidad (opcional)' }).click()
    await page.getByLabel('Velocidad de la canción (BPM, opcional)').fill(options.defaultBpm)
  }
  await page.getByRole('button', { name: 'Crear versión' }).click()
  await expectArrangementVisible(page, label)

  if (options?.lyrics || options?.chords) {
    if (options.lyrics) {
      await openArrangementEditor(page, 'lyrics')
      await page.getByTestId('digitizer-lyrics').fill(options.lyrics)
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await returnToArrangement(page)
    }
    if (options.chords) {
      await openArrangementEditor(page, 'chords')
      await page.getByTestId('arrangement-chords').fill(options.chords)
      await page.getByRole('button', { name: 'Guardar cambios' }).click()
      await returnToArrangement(page)
    }
    await openPractice(page)
  }
}

export async function selectArrangementEditorMode(page: Page, mode: 'lyrics' | 'chords' | 'timing') {
  await openArrangementEditor(page, mode === 'chords' ? 'chords' : 'lyrics')
}

export async function expectArrangementVisible(page: Page, label: string) {
  await expect(page.getByRole('navigation', { name: 'Ruta' }).getByText(label, { exact: true })).toBeVisible()
}

export async function openArrangementEditor(page: Page, section: 'lyrics' | 'chords' = 'lyrics') {
  const path = new URL(page.url()).pathname
  if (path.endsWith(`/edit/${section}`)) {
    await expect(page.getByTestId('chordpro-digitizer')).toBeVisible()
    return
  }
  if (path.includes('/edit/')) await returnToArrangement(page)

  const dialog = page.getByTestId('arrangement-edit-dialog')
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Editar', exact: true }).click()
  }
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: section === 'lyrics' ? /Editar letra/ : /Editar acordes/ }).click()
  await expect(page).toHaveURL(new RegExp(`/edit/${section}(?:[?#]|$)`))
  await expect(page.getByTestId('chordpro-digitizer')).toBeVisible()
  if (section === 'lyrics') {
    await expect(page.getByTestId('digitizer-lyrics')).toBeVisible()
  } else {
    await expect(page.getByTestId('arrangement-chords')).toBeVisible()
  }
}

async function returnToArrangement(page: Page) {
  if (new URL(page.url()).pathname.includes('/edit/')) {
    await page.getByRole('button', { name: 'Volver a editar' }).click()
    await expect(page).not.toHaveURL(/\/edit\//)
  }
}

export async function openPractice(page: Page) {
  await returnToArrangement(page)
  if (await page.getByRole('link', { name: 'Practicar', exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('link', { name: 'Practicar', exact: true }).click()
  }
  await expect(page.getByTestId('practice-tab-estudiar')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Letra', exact: true })).toBeVisible()
}

async function openArrangementMaterials(page: Page) {
  const materialsDialog = page.getByTestId('song-arrangement-materials-dialog')
  if (!(await materialsDialog.isVisible().catch(() => false))) {
    if (!(await page.getByTestId('song-hero').isVisible().catch(() => false))) {
      await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link').nth(2).click()
      await expect(page.getByTestId('song-hero')).toBeVisible()
    }
    await page.getByRole('button', { name: 'Editar materiales' }).click()
    await expect(materialsDialog).toBeVisible()
  }
  await expect(materialsDialog.getByRole('button', { name: 'Agregar enlace' })).toBeVisible()
}

export async function createLinkResource(
  page: Page,
  input: { label: string; url: string; purpose?: string },
) {
  await openArrangementMaterials(page)
  await page.getByRole('button', { name: 'Agregar enlace' }).click()
  await expect(page.getByLabel('Tipo de material')).toBeVisible()
  await page.getByLabel('Tipo de material').selectOption(input.purpose ?? 'practice')
  await page.getByLabel('Nombre del material', { exact: true }).fill(input.label)
  await page.getByLabel('URL').fill(input.url)
  await page.getByRole('button', { name: 'Crear enlace' }).click()
  await expect(page.getByText(input.label, { exact: true })).toBeVisible()
  const link = page.getByRole('link', { name: input.url })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', input.url)
  await expect(link).toHaveAttribute('target', '_blank')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('song-arrangement-materials-dialog')).toHaveCount(0)
  await page.getByRole('link', { name: 'Practicar', exact: true }).click()
  await expect(page.getByTestId('practice-tab-estudiar')).toBeVisible()
}

export async function createFileResource(
  page: Page,
  input: { label: string; filePath: string; purpose?: string },
) {
  await openArrangementMaterials(page)
  const materialsDialog = page.getByTestId('song-arrangement-materials-dialog')
  await materialsDialog.getByRole('button', { name: 'Subir archivo' }).click()
  const uploadDialog = page.getByRole('dialog').filter({ has: page.getByTestId('arrangement-file-dropzone') })
  await expect(uploadDialog).toBeVisible()
  const uploadForm = uploadDialog.locator('form').filter({ has: page.getByTestId('arrangement-file-dropzone') })
  await uploadForm.getByLabel('Tipo de material').selectOption(input.purpose ?? 'practice')
  await uploadForm.getByLabel('Nombre del material', { exact: true }).fill(input.label)
  await uploadForm.getByTestId('arrangement-file-dropzone').locator('input[type="file"]').setInputFiles(input.filePath)
  await expect(uploadForm.getByTestId('arrangement-file-dropzone')).toContainText(path.basename(input.filePath))
  await uploadForm.getByRole('button', { name: 'Subir archivo' }).click()
  const row = page.getByRole('listitem').filter({ hasText: input.label })
  await expect(row.getByText(input.label, { exact: true })).toBeVisible()
  await expect(row.getByRole('link', { name: 'Descargar' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('song-arrangement-materials-dialog')).toHaveCount(0)
  await page.getByRole('link', { name: 'Practicar', exact: true }).click()
  await expect(page.getByTestId('practice-tab-estudiar')).toBeVisible()
  await page.getByRole('tab', { name: 'Ensayo y arreglo' }).click()
}

export async function deleteSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Editar canción' }).click()
  const editDialog = page.getByTestId('song-edit-dialog')
  await expect(editDialog).toBeVisible()
  await editDialog.getByTestId('danger-zone').getByRole('button', { name: 'Eliminar canción' }).click()
  const confirmation = page.getByTestId('song-delete-confirmation')
  await expect(confirmation).toBeVisible()
  await confirmation.getByLabel('Título de la canción').fill(title)
  await confirmation.getByRole('button', { name: 'Eliminar canción' }).click()
  await expect(page.getByRole('heading', { name: 'Canciones' })).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
}

export async function openSetlists(page: Page) {
  await page.getByTestId('group-rail').getByRole('link', { name: 'Listas', exact: true }).click()
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

/** optionLabel is `songTitle — arrangementLabel` from the add-song dialog. */
export async function addArrangementToSetlist(page: Page, optionLabel: string) {
  const [songTitle, arrangementLabel] = optionLabel.split(' — ')
  const dialog = page.getByRole('dialog', { name: 'Agregar canciones a la lista' })
  if (!(await dialog.isVisible())) {
    await page.getByRole('button', { name: 'Agregar a la lista' }).click()
  }
  const song = dialog.locator('ul[aria-label="Arreglo"] li').filter({ hasText: songTitle ?? optionLabel })
  await song.getByRole('button').first().click()
  await dialog.getByRole('button', { name: 'Agregar seleccionadas' }).click()
  await dialog.getByRole('button', { name: 'Listo' }).click()
  let item = page.getByRole('listitem').filter({ hasText: songTitle ?? optionLabel })
  if (arrangementLabel) {
    item = item.filter({ hasText: arrangementLabel })
  }
  await expect(item.last()).toBeVisible()
}

export async function saveSetlistOrder(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios sin guardar')).toHaveCount(0)
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

export async function inviteMemberAndReadLink(page: Page, email?: string): Promise<string> {
  // The members page has a single "Add member" entry point that asks with/without
  // an account; the invitation (with account) lives in its own dialog.
  await openPeople(page)
  await page.getByRole('button', { name: 'Agregar miembro' }).first().click()
  await page.getByRole('button', { name: /Con cuenta/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  if (email) {
    await dialog.getByLabel('Correo del invitado (opcional)').fill(email)
  }
  await dialog.getByRole('button', { name: 'Invitar miembro' }).click()
  const inviteLink = dialog.getByLabel('Enlace de invitación')
  await expect(inviteLink).toBeVisible()
  const url = await inviteLink.inputValue()
  expect(url).toContain('/join/')
  await expect(dialog.getByRole('button', { name: 'Invitar miembro' })).toBeEnabled()
  // Close the dialog so the caller can keep driving the page.
  await dialog.getByRole('button', { name: 'Cerrar' }).first().click()
  await expect(dialog).toBeHidden()
  // Path-only so Playwright stays on baseURL host (localhost vs 127.0.0.1 cookie jar).
  return new URL(url, page.url()).pathname
}

export async function acceptInvite(page: Page) {
  await expect(page).toHaveURL(/\/join\//)
  await expect(page.getByText('Comprobando sesión…')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Unirte a este grupo' })).toBeVisible()
  await page.getByRole('button', { name: 'Aceptar invitación' }).click()
  // Acceptance is asynchronous: wait for the API response, route transition,
  // and group membership data before callers navigate elsewhere.
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]+$/i)
  await expect(page.getByTestId('group-rail')).toBeVisible()
}

export async function openPeople(page: Page) {
  await page.getByTestId('group-rail').getByRole('link', { name: 'Miembros', exact: true }).click()
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
