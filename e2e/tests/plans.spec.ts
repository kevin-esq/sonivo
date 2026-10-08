import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test.describe('Plans page (/plan)', () => {
  test('shows the real plan catalog and the plan per group', async ({ page }) => {
    await register(page, uniqueEmail('plans'))
    await createGroup(page, `Plans Band ${Date.now()}`)

    await page.goto('/plan')

    await expect(page.getByRole('heading', { level: 1, name: 'Planes' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Planes disponibles' })).toBeVisible()
    // At least one plan card with a CTA into membership.
    await expect(page.getByRole('link', { name: 'Elegir plan' }).first()).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Tu plan por grupo' })).toBeVisible()
    await expect(page.getByText('Plan:', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Miembros', { exact: true }).first()).toBeVisible()
  })
})
