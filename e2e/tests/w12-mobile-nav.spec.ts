import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

/** Mobile navigation has one quick-access row and a menu for the remaining destinations. */
test.describe('W12 mobile navigation completeness', () => {
  test('mobile quick navigation includes home and tasks without duplicating More', async ({ page }) => {
    // Register/create at desktop width (the rail carries the role line the
    // helper asserts), then shrink to the phone width under test.
    const email = uniqueEmail('w12nav')
    await register(page, email)
    await createGroup(page, `W12 ${Date.now()}`)

    await page.setViewportSize({ width: 390, height: 844 })
    const quickNavigation = page.getByTestId('mobile-section-nav')
    await expect(quickNavigation).toBeVisible()
    await expect(page.getByTestId('mobile-tabbar')).toHaveCount(0)
    await expect(quickNavigation.getByRole('link')).toHaveText(['Inicio', 'Canciones', 'Listas', 'Eventos', 'Tareas', 'Miembros', 'Recursos'])
    const groupPath = new URL(page.url()).pathname
    const more = page.getByTestId('mobile-more')
    await more.locator('summary').click()
    for (const name of ['Inicio', 'Tareas', 'Calendario']) {
      await expect(more.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    await expect(more.getByRole('link', { name: 'Ajustes del grupo', exact: true })).toBeVisible()
    await more.locator('summary').click()
    await quickNavigation.getByRole('link', { name: 'Tareas', exact: true }).click()
    await expect(page).toHaveURL(`${groupPath}/tasks`, { timeout: 30_000 })
    await quickNavigation.getByRole('link', { name: 'Inicio', exact: true }).click()
    await expect(page).toHaveURL(groupPath, { timeout: 30_000 })
    await expect(quickNavigation.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.screenshot({ path: '../output/playwright/group-mobile-home-navigation.png' })
    const people = quickNavigation.getByRole('link', { name: 'Miembros', exact: true })
    await expect(people).toBeVisible()
    await people.click()

    await expect(page).toHaveURL(/\/people$/)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  })
})
