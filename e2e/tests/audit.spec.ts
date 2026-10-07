import { expect, test } from '@playwright/test'
import { createGroup, inviteMemberAndReadLink, register, uniqueEmail } from './helpers'

test.describe('Group audit log (ADR-0051)', () => {
  test('owner sees the activity log with an invitation entry', async ({ page }) => {
    await register(page, uniqueEmail('audit'))
    await createGroup(page, `Audit Band ${Date.now()}`)

    // Creating an invitation writes an append-only audit entry.
    await inviteMemberAndReadLink(page)

    await page.getByRole('link', { name: 'Ajustes del grupo' }).first().click()
    await expect(page.getByRole('heading', { name: 'Ajustes del grupo' })).toBeVisible()

    await page.getByRole('tab', { name: 'Auditoría' }).click()
    await expect(page.getByRole('heading', { name: 'Registro de actividad' })).toBeVisible()
    await expect(page.getByTestId('audit-list')).toBeVisible()
    await expect(page.getByText('Invitación creada')).toBeVisible()
  })
})
