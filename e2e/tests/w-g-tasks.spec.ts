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
    await dialog.getByLabel('Titulo').fill(`W-G Tarea ${stamp}`)
    await dialog.getByRole('button', { name: 'Crear tarea' }).click()

    await expect(page.getByText(`W-G Tarea ${stamp}`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar completada' })).toBeVisible()

    await page.getByRole('button', { name: 'Marcar completada' }).click()
    await expect(page.getByRole('button', { name: 'Reabrir' })).toBeVisible()
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

  test('TC-WS-16 board view groups tasks into columns', async ({ page }) => {
    const email = uniqueEmail('wgboard')
    await register(page, email)
    const stamp = Date.now()
    await createGroup(page, `W-G Board ${stamp}`)
    const id = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(id).toBeTruthy()

    await page.getByTestId('group-rail').getByRole('link', { name: 'Tareas' }).click()
    await expect(page.getByRole('heading', { name: 'Tareas' })).toBeVisible()

    for (const title of [`Board A ${stamp}`, `Board B ${stamp}`]) {
      await page.getByRole('button', { name: 'Nueva tarea' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Titulo').fill(title)
      await dialog.getByRole('button', { name: 'Crear tarea' }).click()
    }

    await page.getByRole('tab', { name: 'Tablero' }).click()
    await expect(page.getByRole('heading', { name: 'No iniciado' })).toBeVisible()
    await expect(page.getByText(`Board A ${stamp}`)).toBeVisible()
    await expect(page.getByText(`Board B ${stamp}`)).toBeVisible()
  })
})
