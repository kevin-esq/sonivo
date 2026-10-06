import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

test('plan limit notices at 80% and 100%', async ({ page }) => {
  await register(page, uniqueEmail('limit'))
  const name = `Limit ${Date.now()}`
  await createGroup(page, name)
  const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)![1]
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()) as { token: string }
  const headers = { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token }

  // Starter caps setlists at 5.
  await page.request.put(`/api/groups/${groupId}/plan`, {
    headers,
    data: { action: 'assign', planId: 'starter' },
  })
  for (let i = 1; i <= 4; i += 1) {
    await page.request.post(`/api/groups/${groupId}/setlists`, {
      headers,
      data: { name: `L${i}` },
    })
  }

  await page.goto(`/groups/${groupId}/setlists`)
  await expect(page.getByText(/Llevas\s+4\s+de\s+5\s+listas/)).toBeVisible()

  await page.request.post(`/api/groups/${groupId}/setlists`, {
    headers,
    data: { name: 'L5' },
  })
  await page.reload()
  await expect(page.getByText(/Alcanzaste el límite de listas/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva lista' })).toBeDisabled()
  await expect(page.getByRole('link', { name: /Ver planes y mejorar/ })).toBeVisible()
})
