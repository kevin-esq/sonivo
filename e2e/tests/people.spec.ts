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
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  await page.goto('/groups')
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
  await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  await page.goto('/groups')
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
    const roster = page.getByRole('region', { name: 'Miembros' })
    await expect(roster.getByText(ownerName)).toBeVisible()
    await expect(roster.getByText(memberName)).toBeVisible()

    // Removal lives in the row menu and asks for confirmation.
    const row = roster.getByRole('row').filter({ hasText: memberName })
    await row.getByRole('button', { name: `Acciones de ${memberName}` }).click()
    await page.getByRole('menuitem', { name: 'Eliminar miembro' }).click()
    const confirm = page.getByTestId('remove-member-dialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Eliminar miembro' }).click()
    await expect(roster.getByText(memberName)).toHaveCount(0)

    await logout(page)
    await loginAs(page, { email: memberEmail })
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)

    await page.goto(groupUrl)
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('No encontramos este grupo o no tienes acceso.')
  })

  test('TC-PPL-02 member profile shows information, activity, access and report placeholders', async ({
    page,
  }) => {
    const stamp = Date.now()
    const ownerEmail = uniqueEmail('ppl2-owner')
    const ownerName = `Owner ${stamp}`

    await registerAndLogin(page, { name: ownerName, email: ownerEmail })
    await createGroup(page, `People Profile ${stamp}`)
    await openPeople(page)

    const roster = page.getByRole('region', { name: 'Miembros' })
    const row = roster.getByRole('row').filter({ hasText: ownerEmail })
    await row.getByRole('button', { name: `Acciones de ${ownerName}` }).click()
    await page.getByRole('menuitem', { name: 'Ver perfil' }).click()

    const profile = page.getByTestId('member-profile-dialog')
    await expect(profile).toBeVisible()
    for (const tab of ['Información', 'Actividad', 'Acceso', 'Reportes']) {
      await expect(profile.getByRole('tab', { name: tab })).toBeVisible()
    }

    // Information carries the real member data.
    await expect(profile.getByText('Organizador').first()).toBeVisible()
    await expect(profile.getByText(ownerEmail).first()).toBeVisible()

    // Reports are named placeholders — never invented numbers.
    await profile.getByRole('tab', { name: 'Reportes' }).click()
    await expect(profile.getByText('Muy pronto').first()).toBeVisible()
    await expect(
      profile.getByText('Todavía no hay datos suficientes para estos reportes.'),
    ).toBeVisible()

    // Your own profile has no destructive actions, but it can act on the person.
    await expect(profile.getByRole('button', { name: `Acciones de ${ownerName}` })).toHaveCount(0)
    await profile.getByRole('button', { name: 'Editar instrumento' }).click()
    await expect(page.getByTestId('edit-instrument-dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(profile).toBeHidden()
    await expect(page.getByTestId('edit-instrument-dialog')).toBeHidden()
  })
})
