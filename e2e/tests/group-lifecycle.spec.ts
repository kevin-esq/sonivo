import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test('owner archives, restores, trashes, and restores a group', async ({ page }) => {
  const name = `Lifecycle ${Date.now()}`
  await register(page, uniqueEmail('group-lifecycle'))
  await createGroup(page, name)
  await page.goto('/groups')

  const card = page.getByRole('listitem').filter({ hasText: name })
  await card.getByRole('button', { name: `Acciones de ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Archivar grupo' }).click()
  await expect(page.getByRole('link', { name })).toHaveCount(0)

  await page.getByRole('button', { name: 'Archivados y papelera' }).click()
  const lifecycleDialog = page.getByRole('dialog', { name: 'Grupos archivados y en papelera' })
  const archived = lifecycleDialog.getByRole('listitem').filter({ hasText: name })
  await archived.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
  await lifecycleDialog.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('listitem').filter({ hasText: name })
    .getByRole('button', { name: `Acciones de ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Eliminar grupo' }).click()
  const deleteDialog = page.getByRole('dialog', { name: '¿Eliminar este grupo?' })
  await expect(deleteDialog).toContainText('30 días')
  await deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByRole('link', { name })).toHaveCount(0)

  await page.getByRole('button', { name: 'Archivados y papelera' }).click()
  const trashed = page.getByRole('dialog', { name: 'Grupos archivados y en papelera' })
    .getByRole('listitem').filter({ hasText: name })
  await expect(trashed).toContainText('En papelera hasta')
  await trashed.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
})

test('owner can recover a group from Trash on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const name = `Mobile lifecycle ${Date.now()}`
  await register(page, uniqueEmail('group-lifecycle-mobile'))
  await page.getByRole('button', { name: 'Nuevo grupo' }).click()
  await page.getByLabel('Nombre').fill(name)
  await page.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.goto('/groups')

  await page.getByRole('listitem').filter({ hasText: name })
    .getByRole('button', { name: `Acciones de ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Eliminar grupo' }).click()
  const deleteDialog = page.getByRole('dialog', { name: '¿Eliminar este grupo?' })
  await deleteDialog.getByRole('button', { name: 'Eliminar', exact: true }).click()

  await page.getByRole('button', { name: 'Archivados y papelera' }).click()
  const lifecycleDialog = page.getByRole('dialog', { name: 'Grupos archivados y en papelera' })
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(noHorizontalOverflow).toBe(true)
  await lifecycleDialog.getByRole('listitem').filter({ hasText: name })
    .getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByRole('link', { name })).toBeVisible()
})

test('owner must confirm permanent deletion of a trashed group', async ({ page }) => {
  const name = `Permanent lifecycle ${Date.now()}`
  await register(page, uniqueEmail('group-permanent-delete'))
  await createGroup(page, name)
  await page.goto('/groups')
  await page.getByRole('listitem').filter({ hasText: name })
    .getByRole('button', { name: `Acciones de ${name}` }).click()
  await page.getByRole('menuitem', { name: 'Eliminar grupo' }).click()
  await page.getByRole('dialog', { name: '¿Eliminar este grupo?' })
    .getByRole('button', { name: 'Eliminar', exact: true }).click()

  await page.getByRole('button', { name: 'Archivados y papelera' }).click()
  const lifecycleDialog = page.getByRole('dialog', { name: 'Grupos archivados y en papelera' })
  const trashed = lifecycleDialog.getByRole('listitem').filter({ hasText: name })
  await trashed.getByRole('button', { name: 'Eliminar definitivamente' }).click()

  const confirmation = page.getByRole('dialog', { name: 'Eliminar grupo definitivamente' })
  await expect(confirmation).toContainText('sus integrantes, contenido y archivos')
  await confirmation.getByRole('button', { name: 'Cancelar' }).click()
  await expect(trashed).toBeVisible()

  await trashed.getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await page.getByRole('dialog', { name: 'Eliminar grupo definitivamente' })
    .getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await expect(page.getByText('Grupo eliminado definitivamente', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Archivados y papelera' }).click()
  await expect(page.getByRole('dialog', { name: 'Grupos archivados y en papelera' })
    .getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
})
