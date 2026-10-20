import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('Plans page (/plans)', () => {
  test('shows server-backed plan status and lets the owner save a manual assignment', async ({ page }) => {
    await register(page, uniqueEmail('plans'))
    await createGroup(page, `Plans Band ${Date.now()}`)

    await page.goto('/plans')

    await expect(page.getByRole('heading', { level: 1, name: 'Planes' })).toBeVisible()
    await expect(page.getByText(/no se procesan cobros reales/i)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Elegir plan' })).toHaveCount(0)

    await expect(page.getByRole('heading', { name: 'Tu plan por grupo' })).toBeVisible()
    await expect(page.getByText('Plan:', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Miembros', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Estado de facturación: Activo')).toBeVisible()

    await page.getByRole('combobox', { name: 'Plan asignado' }).selectOption('starter')
    await page.getByRole('button', { name: 'Guardar asignación manual' }).click()
    await expect(page.getByText('Plan: Inicial')).toBeVisible()
    await expect(page.getByText('Estado de facturación: Activo')).toBeVisible()
  })
})
