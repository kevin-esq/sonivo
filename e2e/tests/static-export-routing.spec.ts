import { expect, test } from '@playwright/test'

test('static host fallback renders the product shell on app and Group routes', async ({ page }) => {
  for (const route of [
    '/app/home',
    '/app/groups/11111111-1111-1111-1111-111111111111',
  ]) {
    await page.goto(route)
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(route)
    await expect(page.getByRole('heading', { name: 'Tu música, en perfecta sintonía' })).toHaveCount(0)
  }
})
