import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  createGroup,
  inviteMemberAndReadLink,
  logout,
  openPeople,
  uniqueEmail,
} from './helpers'

test.describe('People journeys', () => {
  test('TC-PPL-01 owner sees roster after invite; removes member; member loses access', async ({
    page,
  }) => {
    const stamp = Date.now()
    const ownerEmail = uniqueEmail('ppl-owner')
    const memberEmail = uniqueEmail('ppl-member')
    const ownerName = `Owner ${stamp}`
    const memberName = `Member ${stamp}`
    const groupName = `People Band ${stamp}`

    await page.goto('/register')
    await page.getByLabel('Display name').fill(ownerName)
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password').fill('TestPass1a')
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()

    await createGroup(page, groupName)
    const groupUrl = page.url()
    expect(groupUrl).toContain('/groups/')

    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await page.goto('/register')
    await page.getByLabel('Display name').fill(memberName)
    await page.getByLabel('Email').fill(memberEmail)
    await page.getByLabel('Password').fill('TestPass1a')
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()

    await page.goto(inviteUrl)
    await acceptInvite(page)
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await logout(page)
    await page.goto('/login')
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password').fill('TestPass1a')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()
    await page.getByRole('link', { name: groupName }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await openPeople(page)
    await expect(page.getByText(ownerName, { exact: true })).toBeVisible()
    await expect(page.getByText(memberName, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: `Remove ${memberName}` }).click()
    await expect(page.getByText(memberName, { exact: true })).toHaveCount(0)

    await logout(page)
    await page.goto('/login')
    await page.getByLabel('Email').fill(memberEmail)
    await page.getByLabel('Password').fill('TestPass1a')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)

    await page.goto(groupUrl)
    await expect(page.getByRole('alert')).toContainText('Group not found or you do not have access.')
  })
})
