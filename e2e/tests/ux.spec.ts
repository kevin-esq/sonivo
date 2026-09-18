import { expect, test } from '@playwright/test'
import {
  createGroup,
  openLibrary,
  register,
  uniqueEmail,
} from './helpers'

test.describe('UX journeys Wave 4', () => {
  test('TC-UX-01 owner empty library shows next-step CTA', async ({ page }) => {
    const email = uniqueEmail('ux-empty')
    const groupName = `UX Band ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)

    await expect(page.getByText('La biblioteca está vacía')).toBeVisible()
    const cta = page.getByTestId('library-empty-add-song')
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page.getByRole('heading', { name: 'Crear canción' })).toBeVisible()
  })
})
