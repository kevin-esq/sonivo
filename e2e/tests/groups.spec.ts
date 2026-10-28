import { expect, test } from '@playwright/test'
import { createGroup, logout, register, uniqueEmail } from './helpers'

test.describe('Group journeys', () => {
  test('authenticated user can create, list, and open a group', async ({ page }) => {
    const email = uniqueEmail('owner')
    const groupName = `Band ${Date.now()}`
    await register(page, email)

    await createGroup(page, groupName)
    await expect(page.getByTestId('rail-brand').getByText('Organizador', { exact: true })).toBeVisible()
    await expect(page.getByRole('main').getByRole('heading', { name: groupName })).toBeVisible()

    await page.goto('/groups')
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
    await expect(page.getByRole('link', { name: groupName })).toBeVisible()
    // The role shows as a chip next to the name (no parentheses, outside the stretched link).
    await expect(
      page.getByRole('listitem').filter({ hasText: groupName }).getByText('Organizador', { exact: true }),
    ).toBeVisible()

    await page.getByRole('link', { name: groupName }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  })

  test('non-member cannot open another user group by URL', async ({ page }) => {
    const ownerEmail = uniqueEmail('owner2')
    const strangerEmail = uniqueEmail('stranger')
    const groupName = `Private ${Date.now()}`

    await register(page, ownerEmail)
    await createGroup(page, groupName)
    const groupUrl = page.url()
    expect(groupUrl).toMatch(/\/groups\/[0-9a-f-]+/i)

    await logout(page)
    await register(page, strangerEmail)
    await page.goto(groupUrl)

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
