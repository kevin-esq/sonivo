import { expect, test } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

test.describe('Passkeys / WebAuthn', () => {
  test('TC-PK-01: register passkey on Security page and display in list', async ({ page }) => {
    const email = uniqueEmail('passkey')
    await register(page, email)

    // Headless Chromium has no platform authenticator, and WebAuthn on an
    // IP-literal origin throws SecurityError — hence CI browses via
    // http://localhost (see ci.yml). Attach a CDP virtual authenticator so
    // navigator.credentials.create() is deterministic on any runner.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    })

    await page.goto('/security')
    await expect(page).toHaveURL(/\/cuenta\/seguridad/)
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
