import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  createGroup,
  inviteMemberAndReadLink,
  logout,
  openPeople,
  testConfirmUser,
  testPassword,
  uniqueEmail,
} from './helpers'

async function registerAndLogin(
  page: Parameters<typeof testConfirmUser>[0],
  input: { name: string; email: string },
) {
  await page.goto('/register')
  await page.getByLabel('Nombre').fill(input.name)
  await page.getByLabel('Correo electrónico').fill(input.email)
  await page.getByLabel('Contraseña').fill(testPassword)
  await page.getByRole('button', { name: 'Registrarse' }).click()
  // T-AU-01: register alone proves nothing — confirm, then sign in.
  await expect(page.getByText('Te enviamos un enlace de confirmación')).toBeVisible()
  await testConfirmUser(page, input.email)
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(input.email)
  await page.getByLabel('Contraseña').fill(testPassword)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

async function loginAs(
  page: Parameters<typeof testConfirmUser>[0],
  input: { email: string; password?: string },
) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(input.email)
  await page.getByLabel('Contraseña').fill(input.password ?? testPassword)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
}

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

    await registerAndLogin(page, { name: ownerName, email: ownerEmail })

    await createGroup(page, groupName)
    const groupUrl = page.url()
    expect(groupUrl).toContain('/groups/')

    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await registerAndLogin(page, { name: memberName, email: memberEmail })

    await page.goto(inviteUrl)
    await acceptInvite(page)
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await logout(page)
    await loginAs(page, { email: ownerEmail })
    await page.getByRole('link', { name: groupName }).click()
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await openPeople(page)
    await expect(page.getByText(ownerName, { exact: true })).toBeVisible()
    await expect(page.getByText(memberName, { exact: true })).toBeVisible()

    await page.getByRole('button', { name: `Eliminar ${memberName}` }).click()
    await expect(page.getByText(memberName, { exact: true })).toHaveCount(0)

    await logout(page)
    await loginAs(page, { email: memberEmail })
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)

    await page.goto(groupUrl)
    await expect(page.getByRole('alert')).toContainText('No encontramos este grupo o no tienes acceso.')
  })
})
