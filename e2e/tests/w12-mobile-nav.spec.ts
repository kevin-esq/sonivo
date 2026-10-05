import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

/**
 * Wave C (Step 3): the mobile chrome must offer every group destination. The
 * bottom bar keeps four big targets; "Más" in the top bar exposes the
 * desktop-only ones (Miembros, Ajustes).
 */
test.describe('W12 mobile navigation completeness', () => {
  test('Miembros is reachable from the mobile top bar', async ({ page }) => {
    // Register/create at desktop width (the rail carries the role line the
    // helper asserts), then shrink to the phone width under test.
    const email = uniqueEmail('w12nav')
    await register(page, email)
    await createGroup(page, `W12 ${Date.now()}`)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('mobile-tabbar')).toBeVisible()
    // "mobile-more" exists in both the top bar and the tab bar; this test
    // verifies the TOP BAR overflow exposes Miembros, so scope to the banner.
    await page.getByRole('banner').getByLabel('Más').click()

    const people = page.getByRole('link', { name: 'Miembros' })
    await expect(people).toBeVisible()
    await people.click()

    await expect(page).toHaveURL(/\/people$/)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  })
})
