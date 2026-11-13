import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('Membership route', () => {
  test('legacy plans route opens account membership', async ({ page }) => {
    await register(page, uniqueEmail('plans'))
    await createGroup(page, `Plans Band ${Date.now()}`)

    await page.goto('/plans')

    await expect(page).toHaveURL(/\/app\/account\/membership$/)
    await expect(page.getByRole('heading', { name: 'Membresía', level: 1 })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Configuración de la cuenta' })).toBeVisible()
  })
})
