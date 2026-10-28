import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test('account logout requires explicit confirmation from desktop and mobile', async ({ page }) => {
  await register(page, uniqueEmail('logout-account'))
  let logoutRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/auth/logout') logoutRequests++
  })
  const dialog = page.getByRole('dialog', { name: '¿Quieres cerrar sesión?' })
  await page.getByTestId('sidebar-logout').click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).not.toBeVisible()
  expect(logoutRequests).toBe(0)
  await expect(page.getByRole('heading', { name: 'Mis grupos', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const more = page.getByTestId('mobile-more')
  await more.locator('summary').click()
  await more.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(logoutRequests).toBe(0)
  await more.locator('summary').click()
  await more.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: '../output/playwright/logout-confirmation-mobile.png' })
  await dialog.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible({ timeout: 30_000 })
  expect(logoutRequests).toBe(1)
  await page.goto('/app/groups')
  await expect(page).toHaveURL(/\/auth\/login/)
})

test('group profile logout can be cancelled on desktop and mobile', async ({ page }) => {
  test.setTimeout(120_000)
  await register(page, uniqueEmail('logout-group'))
  await createGroup(page, `Logout Group ${Date.now()}`)
  const groupPath = new URL(page.url()).pathname
  const dialog = page.getByRole('dialog', { name: '¿Quieres cerrar sesión?' })
  const menu = page.getByTestId('topbar-user-menu')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click()
    await menu.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused()
    if (width === 1280) await page.screenshot({ path: '../output/playwright/logout-confirmation-desktop.png' })
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page).toHaveURL(groupPath)
    await expect(page.getByTestId('group-topbar')).toBeVisible()
  }
  await menu.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible({ timeout: 30_000 })
})
