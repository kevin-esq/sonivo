import { expect, test } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

test.describe('Passkeys / WebAuthn', () => {
  test('TC-PK-01: register passkey on Security page and display in list', async ({ page }) => {
    const email = uniqueEmail('passkey')
    await register(page, email)

    await page.goto('/security')
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Llaves de acceso (Passkeys)' })).toBeVisible()
    await expect(page.getByText('No tienes llaves de acceso registradas.')).toBeVisible()

    await page.getByLabel('Nombre del dispositivo').fill('Mi Laptop E2E')
    await page.getByRole('button', { name: 'Agregar llave de acceso' }).click()

    await expect(page.getByText('Mi Laptop E2E')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eliminar' })).toBeVisible()

    await page.getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByText('No tienes llaves de acceso registradas.')).toBeVisible()
  })
})
