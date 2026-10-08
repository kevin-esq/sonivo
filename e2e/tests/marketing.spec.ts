import { expect, test } from '@playwright/test'

test.describe('Public marketing landing (ADR-0076 public entry)', () => {
  test('renders for guests and its CTAs route into the product', async ({ page }) => {
    await page.goto('/bienvenido')

    // Hero + the three public sections (no session required).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/repertorio/i)
    await expect(page.getByRole('heading', { name: /todo lo que tu grupo necesita/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /empieza en tres pasos/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /planes para cada etapa/i })).toBeVisible()

    // Primary CTA enters registration.
    await page.getByRole('link', { name: 'Empezar gratis' }).click()
    await expect(page).toHaveURL(/\/register/)
    await expect(page.locator('form').first()).toBeVisible()
  })

  test('is reachable from the login screen', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Conoce Sonivo' }).click()
    await expect(page).toHaveURL(/\/bienvenido/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/repertorio/i)
  })
})
