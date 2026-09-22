import { expect, test } from '@playwright/test'
import {
  login,
  logout,
  register,
  testConfirmUser,
  testPassword,
  uniqueEmail,
} from './helpers'

// T-AU-01 E2E scope note: the confirm happy path via the real emailed link
// is NOT E2E-covered — there is no mailbox in E2E. API tests cover confirm
// with white-box generated tokens (happy, invalid, reuse-denied). E2E covers
// the denial path (unverified login blocked + permanent copy), the always-on
// resend affordance, and the forgot-password accepted shape.
test.describe('Authentication journeys', () => {
  test('register requires verification; unverified login blocked; resend accepted', async ({
    page,
  }) => {
    const email = uniqueEmail('verify')

    await page.goto('/register')
    await page.getByLabel('Nombre').fill(email.split('@')[0] ?? 'e2e')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(testPassword)
    await page.getByRole('button', { name: 'Registrarse' }).click()
    await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible()

    await page.goto('/login')
    // Permanent, unconditional copy + resend affordance (never conditioned
    // on the login response — no oracle).
    await expect(
      page.getByText('Tu cuenta aún no está verificada — revisa tu bandeja o reenvía el correo'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reenviar correo' })).toBeVisible()

    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(testPassword)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    // Identical-401 shape: generic credentials error, no session created.
    await expect(page.getByRole('alert')).toContainText('Invalid email or password.')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toHaveCount(0)

    // Resend is always accepted.
    await page.getByRole('button', { name: 'Reenviar correo' }).click()
    await page.getByRole('button', { name: 'Reenviar correo' }).last().click()
    await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible()

    // After out-of-band confirmation the same credentials sign in.
    await testConfirmUser(page, email)
    await login(page, email, testPassword)
    await expect(page.getByText(email)).toBeVisible()
  })

  test('forgot-password is always accepted', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByRole('heading', { name: 'Restablecer contraseña' })).toBeVisible()
    await page.getByLabel('Correo electrónico').fill(uniqueEmail('forgot'))
    await page.getByRole('button', { name: 'Restablecer contraseña' }).click()
    await expect(page.getByText(/te enviamos un enlace/i)).toBeVisible()
  })

  test('login restores session; logout clears it', async ({ page }) => {
    const email = uniqueEmail('login')
    await register(page, email)
    await logout(page)

    await login(page, email, testPassword)
    await expect(page.getByText(email)).toBeVisible()

    await logout(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
