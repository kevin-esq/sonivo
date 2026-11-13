import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('W1 shell: group vs account', () => {
  test('group and account navigation keep their own destinations', async ({ page }) => {
    const email = uniqueEmail('w1shell')
    await register(page, email)
    const name = `W1 Group ${Date.now()}`
    await createGroup(page, name)

    const shell = page.getByTestId('grupo-shell')
    await expect(shell).toBeVisible()
    await expect(shell).toHaveAttribute('style', /--group-accent/)

    const groupNav = page.getByRole('navigation', { name: 'Grupo' })
    await expect(groupNav.getByRole('link', { name: 'Canciones' })).toBeVisible()
    // Group settings belongs to the normal administration navigation.
    await expect(page.getByTestId('rail-settings')).toBeVisible()

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: /^Hola,/ })).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    const cuentaNav = page.getByRole('navigation', { name: 'Configuración de la cuenta' }).filter({ visible: true })
    for (const tab of ['Perfil', 'Preferencias']) {
      await expect(cuentaNav.getByRole('link', { name: tab })).toBeVisible()
    }
    await expect(cuentaNav.getByRole('link', { name: 'Notificaciones' })).toHaveAttribute('href', '/app/account/notifications')
    await expect(cuentaNav.getByRole('link', { name: 'Membresía' })).toBeVisible()

    await cuentaNav.getByRole('link', { name: 'Notificaciones' }).click()
    await expect(page).toHaveURL(/\/app\/account\/notifications$/)
    await expect(page.getByRole('heading', { name: 'Notificaciones de la cuenta' })).toBeVisible()
  })

  test('/settings/security redirects to /account/security with passkey section', async ({ page }) => {
    await register(page, uniqueEmail('w1redir'))
    await page.goto('/settings/security')
    await expect(page).toHaveURL(/\/account\/security/)
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Llaves de acceso (Passkeys)' })).toBeVisible()
  })

  test('theme toggle flips data-theme and persists', async ({ page }) => {
    await register(page, uniqueEmail('w1theme'))
    await page.goto('/account/preferences')
    const before = await page.evaluate(() => document.documentElement.dataset.theme)
    const target = before === 'light' ? 'Oscuro' : 'Claro'
    await page.getByRole('button', { name: target, exact: true }).click()
    const after = before === 'light' ? 'dark' : 'light'
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(after)
    await page.reload()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(after)
    const stored = await page.evaluate(() => window.localStorage.getItem('sonivo:theme'))
    expect(stored).toBe(after)
  })

  test('language switcher flips chrome strings es<->en', async ({ page }) => {
    await register(page, uniqueEmail('w1lang'))
    await page.goto('/account/preferences')
    const language = page.getByLabel('Idioma')
    await language.selectOption('en')
    const enNav = page.getByRole('navigation', { name: 'Account settings' }).filter({ visible: true })
    await expect(enNav.getByRole('link', { name: 'Profile' })).toBeVisible()
    await expect(enNav.getByRole('link', { name: 'Security' })).toBeVisible()
    await page.getByLabel('Language').selectOption('es')
    const esNav = page.getByRole('navigation', { name: 'Configuración de la cuenta' }).filter({ visible: true })
    await expect(
      esNav.getByRole('link', { name: 'Perfil' }),
    ).toBeVisible()
  })
})
