import { expect, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

/**
 * Phase 4.3 branding (F2b). Requires the API with Features__GroupBranding=true
 * (default off). Flag off runs the complementary assertions.
 */
async function findGroup(page: import('@playwright/test').Page, name: string): Promise<{ id: string; slug: string }> {
  const response = await page.request.get('/api/groups')
  expect(response.ok()).toBeTruthy()
  const groups = (await response.json()) as Array<{ id: string; name: string; slug: string | null }>
  const group = groups.find((item) => item.name === name)
  expect(group?.slug, 'group should expose a slug').toBeTruthy()
  return { id: group!.id, slug: group!.slug! }
}

test.describe('W20 group branding', () => {
  test('server branding applies tokens and the /g/{slug} path resolves', async ({ page, browser, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.groupBranding, 'Features:GroupBranding is off')

    const email = uniqueEmail('w20brand')
    await register(page, email)
    const name = `W20 ${Date.now()}`
    await createGroup(page, name)
    const { id: groupId, slug } = await findGroup(page, name)

    const group = await (await page.request.get(`/api/groups/${groupId}`)).json() as {
      capabilities: { accent: boolean; brandName: boolean }
    }
    // Configure only a capability granted by the group's effective plan.
    const updateStatus = await page.evaluate(async ({ id, canCustomizeBrandName }: { id: string; canCustomizeBrandName: boolean }) => {
      const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()
      const response = await fetch(`/api/groups/${id}/branding`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token },
        body: JSON.stringify({
          expectedVersion: 0,
          accentHex: '#0a5c2e',
          displayName: canCustomizeBrandName ? 'Marca E2E' : null,
          showSonivoCredit: true,
        }),
      })
      return response.status
    }, { id: groupId, canCustomizeBrandName: group.capabilities.brandName })
    expect(updateStatus).toBe(group.capabilities.accent ? 200 : 400)

    // /g/{slug} resolves and forwards to the workspace.
    await page.goto(`/g/${slug}`)
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`))

    // The server accent is applied as the group token.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const shell = document.querySelector('[data-testid="grupo-shell"]')
          return shell ? getComputedStyle(shell).getPropertyValue('--group-accent').trim() : ''
        }),
      )
      .toBe(group.capabilities.accent ? '#0a5c2e' : '#8366f1')

    // The dynamic per-group manifest is linked.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? ''))
      .toContain(`/g/${slug}/manifest.webmanifest`)

    // Anonymous branded access screen shows the group brand (flag on).
    const anon = await browser.newContext()
    try {
      const anonPage = await anon.newPage()
      await anonPage.goto(`/g/${slug}/login`)
      const brandedLogin = anonPage.getByTestId(group.capabilities.brandName ? 'branded-login-branded' : 'branded-login-plain')
      await expect(brandedLogin).toBeVisible()
      if (group.capabilities.brandName) await expect(brandedLogin.getByText('Marca E2E').first()).toBeVisible()
    } finally {
      await anon.close()
    }
  })

  test('with the flag off the branded login shows no group banner', async ({ page, browser, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(flags.groupBranding, 'Features:GroupBranding is on')

    const email = uniqueEmail('w20off')
    await register(page, email)
    const name = `W20off ${Date.now()}`
    await createGroup(page, name)
    const { slug } = await findGroup(page, name)

    const anon = await browser.newContext()
    try {
      const anonPage = await anon.newPage()
      await anonPage.goto(`/g/${slug}/login`)
      await expect(anonPage.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
      await expect(anonPage.getByTestId('branded-login-plain')).toBeVisible()
      await expect(anonPage.getByText(name, { exact: true })).toHaveCount(0)
    } finally {
      await anon.close()
    }
  })

  test('organizer sees branding controls allowed by the current plan', async ({ page, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.groupBranding, 'Features:GroupBranding is off')

    const email = uniqueEmail('w20ui')
    await register(page, email)
    const name = `W20ui ${Date.now()}`
    await createGroup(page, name)
    const { id: groupId } = await findGroup(page, name)
    const group = await (await page.request.get(`/api/groups/${groupId}`)).json() as {
      capabilities: { accent: boolean; splitColors: boolean; banner: boolean }
    }

    await page.goto(`/groups/${groupId}/settings`)
    // Branding lives behind the "Identidad visual" tab (redesigned Ajustes).
    await page.getByRole('tab', { name: 'Identidad visual' }).click()
    const editor = page.getByTestId('branding-editor')
    await expect(editor).toBeVisible()

    const colorInputs = editor.locator('input[type="color"]')
    if (group.capabilities.accent) {
      await colorInputs.nth(0).fill('#047857')
      await page.getByRole('button', { name: /Guardar identidad|Save identity/ }).click()
      await expect(page.getByText(/Identidad guardada|Identity saved/)).toBeVisible()
    } else {
      await expect(colorInputs.nth(0)).toBeDisabled()
    }
    if (!group.capabilities.splitColors || !group.capabilities.banner) {
      await expect(editor.getByTestId('brand-plan-lock')).toBeVisible()
    }

    await expect
      .poll(async () => {
        const branding = await (await page.request.get(`/api/groups/${groupId}/branding`)).json()
        return { accent: branding.accentHex, secondary: branding.secondaryHex, banner: branding.hasBanner }
      })
      .toEqual({ accent: group.capabilities.accent ? '#047857' : null, secondary: null, banner: false })

    // The group shell applies the saved primary as a scoped brand token.
    await page.goto(`/groups/${groupId}`)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const shell = document.querySelector('[data-testid="grupo-shell"]')
          return shell ? getComputedStyle(shell).getPropertyValue('--brand-primary').trim() : ''
        }),
      )
      .toBe(group.capabilities.accent ? '#047857' : '#8366f1')
  })
})
