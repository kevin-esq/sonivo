import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('W1 shell: Grupo vs Cuenta', () => {
  test('grupo tabs visible in group; cuenta renders 4 sections', async ({ page }) => {
    const email = uniqueEmail('w1shell')
    await register(page, email)
    const name = `W1 Grupo ${Date.now()}`
    await createGroup(page, name)

    const shell = page.getByTestId('grupo-shell')
    await expect(shell).toBeVisible()
    await expect(shell).toHaveAttribute('style', /--group-accent/)

    const groupNav = page.getByRole('navigation', { name: 'Grupo' })
    await expect(groupNav.getByRole('link', { name: 'Biblioteca' })).toBeVisible()
    await expect(groupNav.getByRole('link', { name: 'Ajustes del grupo' })).toBeVisible()

    await page.goto('/cuenta')
    await expect(page.getByRole('heading', { name: 'Cuenta', exact: true })).toBeVisible()
    const cuentaNav = page.getByRole('navigation', { name: 'Secciones de la cuenta' })
    for (const tab of ['Perfil', 'Preferencias', 'Seguridad', 'Mis grupos']) {
      await expect(cuentaNav.getByRole('link', { name: tab })).toBeVisible()
    }
  })

  test('/settings/security redirects to /cuenta/seguridad with passkey section', async ({ page }) => {
    await register(page, uniqueEmail('w1redir'))
    await page.goto('/settings/security')
    await expect(page).toHaveURL(/\/cuenta\/seguridad/)
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Llaves de acceso (Passkeys)' })).toBeVisible()
  })

  test('theme toggle flips data-theme and persists', async ({ page }) => {
    await register(page, uniqueEmail('w1theme'))
    await page.goto('/cuenta/preferencias')
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
    await page.goto('/cuenta/preferencias')
    const cuentaNav = page.getByRole('navigation', { name: 'Secciones de la cuenta' })
    await page.getByRole('button', { name: 'Inglés' }).click()
    await expect(page.getByRole('navigation', { name: 'Account sections' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Account sections' }).getByRole('link', { name: 'My groups' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Spanish', exact: true }).click()
    await expect(cuentaNav.getByRole('link', { name: 'Mis grupos' })).toBeVisible()
  })
})
