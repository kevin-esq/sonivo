import { expect, test } from '@playwright/test'

test.describe('Public marketing landing (ADR-0076 public entry)', () => {
  test('renders for guests and its CTAs route into the product', async ({ page }) => {
    await page.goto('/')

    // Hero and the public product walkthrough (no session required).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu música, en perfecta sintonía')
    await expect(page.getByRole('heading', { name: /todo lo que tu grupo necesita/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /empieza en tres pasos/i })).toBeVisible()

    // The primary CTA enters registration without making unapproved free-plan claims.
    await page.getByRole('link', { name: 'Comenzar' }).click()
    await expect(page).toHaveURL(/\/register/)
    await expect(page.locator('form').first()).toBeVisible()
  })

  test('is reachable from the login screen', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: 'Sonivo' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu música, en perfecta sintonía')
  })
})
