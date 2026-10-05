import { expect, test } from '@playwright/test'
import { createGroup, logout, openPeople, register, uniqueEmail } from './helpers'

test.describe('W-E members', () => {
  test('TC-WS-11 members list shows role tabs, email and presence', async ({ page }) => {
    const email = uniqueEmail('wemembers')
    await register(page, email)
    const stamp = Date.now()
    await createGroup(page, `W-E Members ${stamp}`)

    await openPeople(page)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()

    for (const tab of ['Todos', 'Administradores', 'Líderes', 'Miembros']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }

    // The current user is the Owner: their email and a presence label are shown.
    await expect(page.getByText(email)).toBeVisible()
    await expect(page.getByText('En línea')).toBeVisible()
  })

  test('TC-WS-12 non-member cannot read the members list', async ({ page }) => {
    const ownerEmail = uniqueEmail('wemembers-owner')
    await register(page, ownerEmail)
    const stamp = Date.now()
    await createGroup(page, `W-E Privado ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await logout(page)
    await register(page, uniqueEmail('wemembers-stranger'))
    await page.goto(`/groups/${id}/people`)
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
