import { expect, test } from '@playwright/test'
import { createGroup, logout, register, uniqueEmail } from './helpers'

test.describe('W-G tasks', () => {
  test('TC-WS-14 owner creates and completes a task', async ({ page }) => {
    const email = uniqueEmail('wgtasks')
    await register(page, email)
    const stamp = Date.now()
    await createGroup(page, `W-G Tasks ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await page.getByTestId('group-rail').getByRole('link', { name: 'Tareas' }).click()
    await expect(page.getByRole('heading', { name: 'Tareas' })).toBeVisible()

    await page.getByRole('button', { name: 'Nueva tarea' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Nueva tarea' })).toBeVisible()
    await dialog.getByLabel('Título').fill(`W-G Tarea ${stamp}`)
    await dialog.getByRole('button', { name: 'Crear tarea' }).click()

    await expect(page.getByText(`W-G Tarea ${stamp}`)).toBeVisible()
    await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Marcar completada' }).click()
    await expect(page.getByText('Completada', { exact: true })).toBeVisible()
  })

  test('TC-WS-15 non-member cannot read tasks', async ({ page }) => {
    const ownerEmail = uniqueEmail('wgtasks-owner')
    await register(page, ownerEmail)
    const stamp = Date.now()
    await createGroup(page, `W-G Privado ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await logout(page)
    await register(page, uniqueEmail('wgtasks-stranger'))
    await page.goto(`/groups/${id}/tasks`)
    await expect(page.getByRole('alert')).toContainText(
      'No encontramos este grupo o no tienes acceso.',
    )
  })
})
