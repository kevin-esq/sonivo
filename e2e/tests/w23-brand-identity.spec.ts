import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

/**
 * White-label regression (owner addendum 2026-10-04): a group's brand colour
 * must repaint the whole workspace through the semantic `--color-*` tokens,
 * not just the header. Also asserts membership is account-level, not a group
 * settings tab.
 */
test.describe('W23 group brand identity', () => {
  test('brand colour drives workspace content actions in light and dark', async ({ page, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.groupBranding, 'Features:GroupBranding is off')

    const email = uniqueEmail('w23brand')
    await register(page, email)
    const name = `W23 ${Date.now()}`
    await createGroup(page, name)
    const groupId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()
    expect(groupId).toBeTruthy()

    // Save a dark-green brand primary through the same API the editor uses.
    await page.evaluate(async (id: string) => {
      const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()
      await fetch(`/api/groups/${id}/branding`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token },
        body: JSON.stringify({ expectedVersion: 0, accentHex: '#0a5c2e', showSonivoCredit: true }),
      })
    }, groupId!)

    await page.goto(`/groups/${groupId}`)
    const shell = page.getByTestId('grupo-shell')

    // The semantic token — not just the legacy --brand-primary — carries the group colour.
    await expect
      .poll(() =>
        shell.evaluate((el) => getComputedStyle(el).getPropertyValue('--color-primary').trim()),
      )
      .toBe('#0a5c2e')

    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => window.localStorage.setItem('sonivo:theme', value), theme)
      await page.reload()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
        .toBe(theme)
      await page.goto(`/groups/${groupId}/library`)
      const addSong = page.getByRole('button', { name: 'Agregar canción' })
      await expect(addSong).toBeVisible()
      // Content action uses the group colour, not the Sonivo default violet (#8366f1).
      await expect
        .poll(() => addSong.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe('rgb(10, 92, 46)')
    }
  })

  test('membership lives in account settings, not in the group workspace', async ({ page }) => {
    const email = uniqueEmail('w23member')
    await register(page, email)
    const name = `W23 Membresía ${Date.now()}`
    await createGroup(page, name)
    const groupId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()

    await page.goto(`/groups/${groupId}/ajustes`)
    await expect(page.getByRole('heading', { name: 'Ajustes del grupo' })).toBeVisible()
    // The group settings centre no longer exposes a "Membresía" tab.
    await expect(page.getByRole('tab', { name: 'Membresía' })).toHaveCount(0)

    // Account settings own membership.
    await page.goto('/cuenta/membresia')
    await expect(page.getByRole('heading', { name: 'Membresía', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Membresías de grupo' })).toBeVisible()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Gestionar miembros' })).toBeVisible()
  })
})
