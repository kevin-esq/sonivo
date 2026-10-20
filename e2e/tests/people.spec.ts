import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  createGroup,
  createSong,
  inviteMemberAndReadLink,
  logout,
  openLibrary,
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
  await page.getByLabel('Correo o usuario').fill(input.email)
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
  await page.getByLabel('Correo o usuario').fill(input.email)
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
    const table = roster.getByRole('table')
    await expect(table.getByText(ownerName)).toBeVisible()
    await expect(table.getByText(memberName)).toBeVisible()

    // Removal lives in the row menu and asks for confirmation.
    const row = roster.getByRole('row').filter({ hasText: memberName })
    await row.getByRole('button', { name: `Acciones de ${memberName}` }).click()
    await page.getByRole('menuitem', { name: 'Eliminar miembro' }).click()
    const confirm = page.getByTestId('remove-member-dialog')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Eliminar miembro' }).click()
    await expect(table.getByText(memberName)).toHaveCount(0)

    await logout(page)
    await loginAs(page, { email: memberEmail })
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)

    await page.goto(groupUrl)
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText('No encontramos este grupo o no tienes acceso.')
  })

  test('TC-PPL-02 member profile shows information, activity and access', async ({
    page,
  }) => {
    const stamp = Date.now()
    const ownerEmail = uniqueEmail('ppl2-owner')
    const ownerName = `Owner ${stamp}`

    await registerAndLogin(page, { name: ownerName, email: ownerEmail })
    await createGroup(page, `People Profile ${stamp}`)
    await openLibrary(page)
    await createSong(page, `Profile Activity Song ${stamp}`)
    await openPeople(page)

    const roster = page.getByRole('region', { name: 'Miembros' })
    const row = roster.getByRole('row').filter({ hasText: ownerEmail })
    await row.getByRole('button', { name: `Acciones de ${ownerName}` }).click()
    await page.getByRole('menuitem', { name: 'Ver perfil' }).click()

    const profile = page.getByTestId('member-profile-dialog')
    await expect(profile).toBeVisible()
    for (const tab of ['Información', 'Actividad', 'Acceso']) {
      await expect(profile.getByRole('tab', { name: tab })).toBeVisible()
    }

    // Information carries the real member data.
    await expect(profile.getByText('Organizador').first()).toBeVisible()
    await expect(profile.getByText(ownerEmail).first()).toBeVisible()

    await profile.getByRole('tab', { name: 'Actividad' }).click()
    await expect(profile.getByText('Agregó una canción al repertorio')).toBeVisible()

    // Account identity links to account settings; Group-level self-deactivation is unavailable.
    await expect(profile.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('href', '/app/account')
    await profile.getByRole('tab', { name: 'Acceso' }).click()
    await expect(profile.getByText('Activo en este grupo')).toBeVisible()
    await expect(profile.getByText('La persona propietaria conserva el acceso al grupo.')).toBeVisible()
    await expect(profile.getByRole('button', { name: 'Desactivar acceso en este grupo' })).toHaveCount(0)

    await profile.getByRole('button', { name: 'Cerrar' }).last().click()
    await expect(profile).toBeHidden()
  })

  test('TC-PPL-03 owner can deactivate and restore access in this group', async ({ page }) => {
    const stamp = Date.now()
    const ownerEmail = uniqueEmail('ppl3-owner')
    const memberEmail = uniqueEmail('ppl3-member')
    const ownerName = `Owner ${stamp}`
    const memberName = `Member ${stamp}`
    const groupName = `Access Band ${stamp}`

    await registerAndLogin(page, { name: ownerName, email: ownerEmail })
    await createGroup(page, groupName)
    const groupUrl = page.url()
    const inviteUrl = await inviteMemberAndReadLink(page)

    await logout(page)
    await registerAndLogin(page, { name: memberName, email: memberEmail })
    await page.goto(inviteUrl)
    await acceptInvite(page)
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

    await logout(page)
    await loginAs(page, { email: ownerEmail })
    await page.goto(groupUrl)
    await openPeople(page)
    const roster = page.getByRole('region', { name: 'Miembros' })
    const row = roster.getByRole('row').filter({ hasText: memberName })
    await row.getByRole('button', { name: `Acciones de ${memberName}` }).click()
    await page.getByRole('menuitem', { name: 'Ver perfil' }).click()
    const profile = page.getByTestId('member-profile-dialog')
    await profile.getByRole('tab', { name: 'Acceso' }).click()
    await expect(profile.getByText('Activo en este grupo')).toBeVisible()
    await profile.getByRole('button', { name: 'Desactivar acceso en este grupo' }).click()
    await expect(profile.getByText('Desactivado en este grupo')).toBeVisible()
    await expect(profile.getByRole('button', { name: 'Reactivar acceso en este grupo' })).toBeVisible()

    await logout(page)
    await loginAs(page, { email: memberEmail })
    await expect(page.getByRole('link', { name: groupName })).toHaveCount(0)
    await page.goto(groupUrl)
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)'))
      .toContainText('No encontramos este grupo o no tienes acceso.')

    await logout(page)
    await loginAs(page, { email: ownerEmail })
    await page.goto(groupUrl)
    await openPeople(page)
    const disabledRow = page.getByRole('region', { name: 'Miembros' }).getByRole('row').filter({ hasText: memberName })
    await disabledRow.getByRole('button', { name: `Acciones de ${memberName}` }).click()
    await page.getByRole('menuitem', { name: 'Ver perfil' }).click()
    const restoredProfile = page.getByTestId('member-profile-dialog')
    await restoredProfile.getByRole('tab', { name: 'Acceso' }).click()
    await restoredProfile.getByRole('button', { name: 'Reactivar acceso en este grupo' }).click()
    await expect(restoredProfile.getByText('Activo en este grupo')).toBeVisible()

    await logout(page)
    await loginAs(page, { email: memberEmail })
    await expect(page.getByRole('link', { name: groupName })).toBeVisible()
    await page.goto(groupUrl)
    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  })
})
