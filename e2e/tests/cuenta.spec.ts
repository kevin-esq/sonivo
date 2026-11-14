import { expect, test } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

test.describe('Account settings', () => {
  test('account navigation stays in its isolated shell across tabs', async ({ page }) => {
    await register(page, uniqueEmail('account-shell'))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/app/account/membership')

    const accountNavigation = page.getByRole('navigation', { name: 'Configuración de la cuenta' }).filter({ visible: true })
    await expect(page.getByRole('heading', { name: 'Membresía', level: 1 })).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Volver a Sonivo' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Buscar' })).toHaveCount(0)
    await expect(accountNavigation.getByRole('link', { name: 'Perfil' })).toBeVisible()

    for (const [label, heading] of [
      ['Perfil', 'Mi cuenta'],
      ['Seguridad', 'Seguridad'],
      ['Preferencias', 'Preferencias'],
      ['Notificaciones de la cuenta', 'Notificaciones de la cuenta'],
      ['Membresía', 'Membresía'],
    ]) {
      await accountNavigation.getByRole('link', { name: label, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Configuración de la cuenta' }).filter({ visible: true })).toBeVisible()
    }
  })

  test('overview links to separate profile, security, preferences and membership pages', async ({ page }) => {
    await register(page, uniqueEmail('account'))
    await page.goto('/account')

    await expect(page.getByRole('heading', { name: /^Hola,/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accesos rápidos' })).toBeVisible()
    const navigation = page.getByRole('navigation', { name: 'Configuración de la cuenta' }).filter({ visible: true })
    for (const section of ['Perfil', 'Seguridad', 'Preferencias', 'Notificaciones', 'Membresía']) {
      await expect(navigation.getByRole('link', { name: section })).toBeVisible()
    }

    await page.goto('/account/security')
    await expect(page.getByRole('heading', { name: 'Seguridad', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sesiones activas' })).toBeVisible()
    await expect(page.getByText('Esta sesión')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar la sesión actual' })).toBeVisible()
  })

  test('revoking the current session ends the signed-in session', async ({ page }) => {
    await register(page, uniqueEmail('account-session'))
    await page.goto('/account/security')

    await page.getByRole('button', { name: 'Cerrar la sesión actual' }).click()
    await expect(page).toHaveURL(/\/auth\/login$/)
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  })

  test('edit profile persists the display name', async ({ page }) => {
    await register(page, uniqueEmail('account-edit'))
    await page.goto('/app/account/profile')

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
