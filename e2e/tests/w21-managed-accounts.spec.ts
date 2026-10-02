import { expect, test } from '@playwright/test'
import { createGroup, logout, register, uniqueEmail } from './helpers'

/**
 * Phase 4.1 (F3b): a member provisioned without an email signs in as handle@slug
 * with a one-use temporary password and is forced through the blocking
 * change-password modal before the API unlocks (ADR-0047).
 */
test('managed account is forced to change its temporary password', async ({ page, request }) => {
  const features = (await (await request.get('/api/features')).json()) as { managedAccounts?: boolean }
  test.skip(!features.managedAccounts, 'Features:ManagedAccounts is off')

  await register(page, uniqueEmail('managed-owner'))
  await createGroup(page, 'Cuentas Gestionadas')

  const provisioned = await page.evaluate(async () => {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
    const { token } = (await csrfResponse.json()) as { token: string }
    const groups = (await (await fetch('/api/groups', { credentials: 'include' })).json()) as Array<{
      id: string
      slug: string | null
    }>
    const group = groups[0]
    const response = await fetch(`/api/groups/${group.id}/roster`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ displayName: 'Persona Gestionada', grantAccess: true }),
    })
    if (!response.ok) {
      throw new Error(`provision failed: ${response.status} ${await response.text()}`)
    }
    const body = (await response.json()) as {
      handle: string | null
      temporaryPassword: string | null
    }
    return { slug: group.slug, handle: body.handle, temporaryPassword: body.temporaryPassword }
  })

  expect(provisioned.slug).toBeTruthy()
  expect(provisioned.handle).toBeTruthy()
  expect(provisioned.temporaryPassword).toBeTruthy()

  await logout(page)

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(`${provisioned.handle}@${provisioned.slug}`)
  await page.getByLabel('Contraseña').fill(provisioned.temporaryPassword as string)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()

  const dialog = page.getByTestId('must-change-password')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible()

  const newPassword = 'NuevaClave1a'
  await page.getByLabel('Contraseña actual').fill(provisioned.temporaryPassword as string)
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(newPassword)
  await page.getByLabel('Repite la nueva contraseña').fill(newPassword)
  await page.getByTestId('must-change-submit').click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
})
