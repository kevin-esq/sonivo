import { expect, test } from '@playwright/test'
import { login, logout, register, testPassword, uniqueEmail } from './helpers'

test.describe('Authentication journeys', () => {
  test('register creates an authenticated session', async ({ page }) => {
    const email = uniqueEmail('reg')
    await register(page, email)
    await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(page.getByText('No groups yet')).toBeVisible()
  })

  test('login restores session; logout clears it', async ({ page }) => {
    const email = uniqueEmail('login')
    await register(page, email)
    await logout(page)

    await login(page, email, testPassword)
    await expect(page.getByText(email)).toBeVisible()

    await logout(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
