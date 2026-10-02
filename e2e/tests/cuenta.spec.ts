import { expect, test } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

test.describe('Account page (ADR-0053 addendum)', () => {
  test('shows the profile sections and disabled placeholders', async ({ page }) => {
    await register(page, uniqueEmail('cuenta'))
    await page.goto('/cuenta')

    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Información personal' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Preferencias' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plan y facturación' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Uso y límites' })).toBeVisible()
    await expect(page.getByTestId('profile-edit')).toBeVisible()
    // Placeholder rows are not interactive.
    await expect(page.getByTestId('account-row-disabled').first()).toBeVisible()
  })

  test('edit profile persists the display name', async ({ page }) => {
    await register(page, uniqueEmail('cuenta-edit'))
    await page.goto('/cuenta')

    await page.getByTestId('profile-edit').click()
    const dialog = page.getByRole('dialog', { name: 'Editar perfil' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Nombre completo').fill('Kevin Esquivel')
    await dialog.getByRole('button', { name: 'Guardar' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Kevin Esquivel').first()).toBeVisible()

    // Persisted server-side.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
    await expect(page.getByText('Kevin Esquivel').first()).toBeVisible()
  })
})
