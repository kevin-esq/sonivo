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
    await page.getByLabel('Nombre').fill(ownerName)
    await page.getByLabel('Correo electrónico').fill(ownerEmail)
    await page.getByLabel('Contraseña').fill('TestPass1a')
    await page.getByRole('button', { name: 'Registrarse' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()

    await createGroup(page, groupName)
    const groupUrl = page.url()
    expect(groupUrl).toContain('/groups/')

    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await page.goto('/register')
    await page.getByLabel('Nombre').fill(memberName)
    await page.getByLabel('Correo electrónico').fill(memberEmail)
    await page.getByLabel('Contraseña').fill('TestPass1a')
    await page.getByRole('button', { name: 'Registrarse' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()

    await page.goto(inviteUrl)
    await acceptInvite(page)
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await logout(page)
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(ownerEmail)
    await page.getByLabel('Contraseña').fill('TestPass1a')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
    await page.getByRole('link', { name: groupName }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await openPeople(page)
    await expect(page.getByText(ownerName, { exact: true })).toBeVisible()
    await expect(page.getByText(memberName, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: `Eliminar ${memberName}` }).click()
    await expect(page.getByText(memberName, { exact: true })).toHaveCount(0)

    await logout(page)
    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(memberEmail)
    await page.getByLabel('Contraseña').fill('TestPass1a')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)

    await page.goto(groupUrl)
    await expect(page.getByRole('alert')).toContainText('Group not found or you do not have access.')
  })
})
