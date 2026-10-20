import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('W1 shell: group vs account', () => {
  test('group tabs visible in group; account renders 4 sections', async ({ page }) => {
    const email = uniqueEmail('w1shell')
    await register(page, email)
    const name = `W1 Group ${Date.now()}`
    await createGroup(page, name)

    const shell = page.getByTestId('grupo-shell')
    await expect(shell).toBeVisible()
    await expect(shell).toHaveAttribute('style', /--group-accent/)

    const groupNav = page.getByRole('navigation', { name: 'Grupo' })
    await expect(groupNav.getByRole('link', { name: 'Canciones' })).toBeVisible()
    // ADR-0055: group settings is pinned in the rail footer, outside the nav.
    await expect(page.getByTestId('rail-settings')).toBeVisible()

    await page.goto('/account')
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
    const cuentaNav = page
      .getByTestId('app-sidebar')
      .getByRole('navigation', { name: 'Secciones' })
    for (const tab of ['Perfil', 'Preferencias']) {
      await expect(cuentaNav.getByRole('link', { name: tab })).toBeVisible()
    }
    // Both App-shell entry points open the existing account notification inbox.
    await expect(cuentaNav.getByTestId('nav-notifications')).toHaveAttribute('href', '/app/account/notifications')
    await expect(page.getByTestId('app-notifications')).toHaveAttribute('href', '/app/account/notifications')
    await expect(page.getByTestId('nav-membership')).toBeVisible()

    await page.getByTestId('app-notifications').click()
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
    await page.getByRole('button', { name: 'Inglés' }).click()
    const enNav = page.getByRole('navigation', { name: 'Sections' })
    await expect(enNav.getByRole('link', { name: 'My groups' })).toBeVisible()
    await page.getByRole('button', { name: 'Spanish', exact: true }).click()
    await expect(
      page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mis grupos' }),
    ).toBeVisible()
  })
})
