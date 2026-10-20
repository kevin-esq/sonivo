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

    // Configure branding through the same API the app uses.
    await page.evaluate(async (id: string) => {
      const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()
      await fetch(`/api/groups/${id}/branding`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token },
        body: JSON.stringify({
          expectedVersion: 0,
          displayName: 'Marca E2E',
          accentHex: '#0a5c2e',
          coverKind: 'gradient',
          coverValue: 'bosque',
          showSonivoCredit: false,
        }),
      })
    }, groupId)

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
      .toBe('#0a5c2e')

    // The dynamic per-group manifest is linked.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? ''))
      .toContain(`/g/${slug}/manifest.webmanifest`)

    // Anonymous branded access screen shows the group brand (flag on).
    const anon = await browser.newContext()
    try {
      const anonPage = await anon.newPage()
      await anonPage.goto(`/g/${slug}/login`)
      const brandedLogin = anonPage.getByTestId('branded-login-branded')
      await expect(brandedLogin).toBeVisible()
      await expect(brandedLogin.getByText('Marca E2E').first()).toBeVisible()
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

  test('organizer edits brand colours and banner in the UI and it persists', async ({ page, request }) => {
    const flags = await (await request.get('/api/features')).json()
    test.skip(!flags.groupBranding, 'Features:GroupBranding is off')

    const email = uniqueEmail('w20ui')
    await register(page, email)
    const name = `W20ui ${Date.now()}`
    await createGroup(page, name)
    const { id: groupId } = await findGroup(page, name)

    await page.goto(`/groups/${groupId}/settings`)
    // Branding lives behind the "Identidad visual" tab (redesigned Ajustes).
    await page.getByRole('tab', { name: 'Identidad visual' }).click()
    const editor = page.getByTestId('branding-editor')
    await expect(editor).toBeVisible()

    // Primary + secondary brand colours (ADR-0054).
    const colorInputs = editor.locator('input[type="color"]')
    await colorInputs.nth(0).fill('#047857')
    await colorInputs.nth(1).fill('#10b981')
    await page.getByRole('button', { name: /Guardar identidad|Save identity/ }).click()
    await expect(page.getByText(/Identidad guardada|Identity saved/)).toBeVisible()

    // Banner upload through the same editor (multipart).
    const bannerInput = editor.locator('input[type="file"]').nth(1)
    let bannerUploadCount = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/branding/banner')) bannerUploadCount += 1
    })
    const oversizedPngBase64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 1024
      const context = canvas.getContext('2d')!
      const image = context.createImageData(canvas.width, canvas.height)
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const value = Math.random() * 256
        image.data[offset] = value
        image.data[offset + 1] = Math.random() * 256
        image.data[offset + 2] = Math.random() * 256
        image.data[offset + 3] = 255
      }
      context.putImageData(image, 0, 0)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
      return await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1]!)
        reader.readAsDataURL(blob)
      })
    })
    await bannerInput.setInputFiles({
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.from(oversizedPngBase64, 'base64'),
    })
    await expect(editor.getByText('too-large.webp')).toBeVisible({ timeout: 15_000 })
    expect(bannerUploadCount).toBe(0)

    await bannerInput.setInputFiles({
      name: 'banner.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=', 'base64'),
    })
    await expect(editor.getByText('banner.png')).toBeVisible()
    await page.getByRole('button', { name: /Guardar identidad|Save identity/ }).click()
    await expect(page.getByText(/Identidad guardada|Identity saved/)).toBeVisible()

    await expect
      .poll(async () => {
        const branding = await (await page.request.get(`/api/groups/${groupId}/branding`)).json()
        return { accent: branding.accentHex, secondary: branding.secondaryHex, banner: branding.hasBanner }
      })
      .toEqual({ accent: '#047857', secondary: '#10b981', banner: true })

    // The group shell applies the saved primary as a scoped brand token.
    await page.goto(`/groups/${groupId}`)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const shell = document.querySelector('[data-testid="grupo-shell"]')
          return shell ? getComputedStyle(shell).getPropertyValue('--brand-primary').trim() : ''
        }),
      )
      .toBe('#047857')
  })
})
