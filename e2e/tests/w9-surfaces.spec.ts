import { expect, type Locator, type Page, test } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

type Rgb = [number, number, number]

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.1 contrast ratio between two opaque RGB colours. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Same computed-style approach as w6-light-theme.spec.ts. */
async function sampleContrast(locator: Locator): Promise<{ ratio: number; gradient: boolean }> {
  const sample = await locator.evaluate((el) => {
    function parse(value: string): [number, number, number, number] | null {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number(part.trim()))
      if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null
      return [parts[0], parts[1], parts[2], parts[3] ?? 1]
    }
    function effectiveBackground(start: Element): { rgb: Rgb; gradient: boolean } {
      const layers: Array<[number, number, number, number]> = []
      let node: Element | null = start
      let base: Rgb = [255, 255, 255]
      while (node) {
        const image = getComputedStyle(node).backgroundImage
        if (image && image !== 'none' && image.includes('gradient')) {
          return { rgb: base, gradient: true }
        }
        const parsed = parse(getComputedStyle(node).backgroundColor)
        if (parsed) {
          const [r, g, b, a] = parsed
          if (a >= 1) {
            base = [r, g, b]
            break
          }
          if (a > 0) layers.unshift([r, g, b, a])
        }
        node = node.parentElement
      }
      let out = base
      for (const [r, g, b, a] of layers) {
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]
      }
      return { rgb: out, gradient: false }
    }
    const text = parse(getComputedStyle(el).color)
    const background = effectiveBackground(el)
    return { text, background: background.rgb, gradient: background.gradient }
  })

  if (sample.gradient || !sample.text) {
    return { ratio: Number.POSITIVE_INFINITY, gradient: sample.gradient }
  }
  const text: Rgb = [sample.text[0], sample.text[1], sample.text[2]]
  return { ratio: contrastRatio(text, sample.background), gradient: false }
}

async function expectReadableText(locator: Locator, minimum = 4.5) {
  const { ratio, gradient } = await sampleContrast(locator)
  if (gradient) return
  const label = (await locator.textContent())?.trim() ?? 'surface text'
  expect(ratio, `contrast for "${label}"`).toBeGreaterThanOrEqual(minimum)
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => window.localStorage.setItem('sonivo:theme', value), theme)
  await page.reload()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
}

test.describe('W9 outside surfaces', () => {
  test('My groups is designed, empty, usable and AA in light', async ({ page }) => {
    const email = uniqueEmail('w9-groups')
    await register(page, email)

    await expect(page.getByRole('heading', { name: 'Mis grupos', level: 1 })).toBeVisible()
    await expect(page.getByText('Aún no tienes grupos', { exact: true })).toBeVisible()

    // La creación vive ahora en un modal ("Nuevo grupo"); el flujo completo se cubre en el spec de grupos.
    await expect(page.getByRole('button', { name: 'Nuevo grupo' })).toBeVisible()
    await page.getByRole('button', { name: 'Nuevo grupo' }).click()
    const nameInput = page.getByLabel('Nombre')
    await expect(nameInput).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear grupo' })).toBeVisible()
    await nameInput.fill('W9 Draft')
    await expect(nameInput).toHaveValue('W9 Draft')
    await page.keyboard.press('Escape')
    await expect(nameInput).toBeHidden()

    await setTheme(page, 'light')
    await expect(page.getByRole('heading', { name: 'Mis grupos', level: 1 })).toBeVisible()
    await expectReadableText(page.getByRole('heading', { name: 'Mis grupos', level: 1 }))
    await expectReadableText(page.getByText(email))
  })

  test('404 is designed and readable in light', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sonivo:theme', 'light'))
    await page.goto('/ruta-inexistente')

    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sonivo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    await expectReadableText(page.getByRole('heading', { name: 'Página no encontrada' }))
    await expectReadableText(page.getByText('La dirección que buscas no existe o fue movida.'))
  })

  test('Ajustes exposes labelled brand swatches/covers and a server-persisted no-cover choice', async ({
    page,
  }) => {
    const email = uniqueEmail('w9-ajustes')
    await register(page, email)
    await createGroup(page, `W9 Ajustes ${Date.now()}`)
    const groupId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()
    expect(groupId).toBeTruthy()

    await page.goto(`/groups/${groupId}/ajustes`)
    await expect(page.getByRole('heading', { name: 'Ajustes del grupo' })).toBeVisible()

    // ADR-0054: the server brand editor renders (flag defaults ON); the primary
    // and secondary swatch groups each carry accessible colour names.
    const editor = page.getByTestId('branding-editor')
    await expect(editor).toBeVisible()
    for (const name of ['Violeta', 'Celeste', 'Esmeralda', 'Ámbar', 'Rojo', 'Lila']) {
      await expect(editor.getByRole('button', { name, exact: true }).first()).toBeVisible()
    }

    // Cover options: every emoji and gradient has an accessible name.
    await expect(editor.getByRole('button', { name: 'Portada con emoji 🎵' })).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Portada con emoji 🎤' })).toBeVisible()
    // Spanish gradient labels replace the English storage ids.
    for (const name of ['violeta', 'océano', 'bosque', 'atardecer']) {
      await expect(editor.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(editor.getByRole('button', { name: 'violet', exact: true })).toHaveCount(0)

    // "Sin portada" exists, is selectable, and round-trips through the server.
    const noCover = editor.getByRole('button', { name: 'Sin portada', exact: true })
    await expect(noCover).toBeVisible()
    await noCover.click()
    await expect(noCover).toHaveAttribute('aria-pressed', 'true')
    await editor.getByRole('button', { name: /Guardar identidad|Save identity/ }).click()
    await expect(page.getByText(/Identidad guardada|Identity saved/)).toBeVisible()

    await page.reload()
    await expect(
      page.getByTestId('branding-editor').getByRole('button', { name: 'Sin portada', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  test('Register labels meet AA contrast in light theme', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('sonivo:theme', 'light'))
    await page.goto('/register')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    for (const label of ['Nombre', 'Correo electrónico', 'Contraseña']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible()
    }
    await expectReadableText(page.getByText('Nombre', { exact: true }))
    await expectReadableText(page.getByText('Correo electrónico', { exact: true }))
    await expectReadableText(page.getByText('Contraseña', { exact: true }))
  })
})
