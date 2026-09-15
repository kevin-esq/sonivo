import { expect, test } from '@playwright/test'
import { createGroup, logout, register, uniqueEmail } from './helpers'

test.describe('Group journeys', () => {
  test('authenticated user can create, list, and open a group', async ({ page }) => {
    const email = uniqueEmail('owner')
    const groupName = `Band ${Date.now()}`
    await register(page, email)

    await createGroup(page, groupName)
    await expect(page.getByText('Selected group shell')).toBeVisible()
    await expect(page.getByText('Role:')).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: 'Owner' })).toBeVisible()
    await expect(page.getByRole('strong').filter({ hasText: '1' })).toBeVisible()

    await page.getByRole('link', { name: 'Back to my groups' }).click()
    await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()
    await expect(page.getByRole('link', { name: groupName })).toBeVisible()
    await expect(page.getByText('(Owner)')).toBeVisible()

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

    await expect(page.getByRole('alert')).toContainText(
      'Group not found or you do not have access.',
    )
  })
})
