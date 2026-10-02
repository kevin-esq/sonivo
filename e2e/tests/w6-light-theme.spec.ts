import { expect, type Locator, test } from '@playwright/test'
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

/**
 * Resolves the rendered text colour and the effective (composited) background
 * by walking ancestors until an opaque background is found. Gradients are
 * reported so the caller can skip coloured hero blocks.
 */
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

/** Assert WCAG AA (>= 4.5) for the text colour; gradient backgrounds are skipped. */
async function expectReadableText(locator: Locator, minimum = 4.5) {
  const { ratio, gradient } = await sampleContrast(locator)
  if (gradient) return
  const label = (await locator.textContent())?.trim() ?? 'shell text'
  expect(ratio, `contrast for "${label}"`).toBeGreaterThanOrEqual(minimum)
}

test.describe('W6 light theme: shell contrast', () => {
  test('shell text stays readable in light and dark', async ({ page }) => {
    const email = uniqueEmail('w6theme')
    await register(page, email)
    await createGroup(page, `W6 Grupo ${Date.now()}`)

    // We are on the group workspace: the rail/header shell is mounted.
    await expect(page.getByTestId('grupo-shell')).toBeVisible()

    await page.goto('/cuenta/preferencias')
    await page.getByRole('button', { name: 'Claro', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    await page.goto('/cuenta')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
    await expect(page.getByRole('heading', { name: 'Cuenta', exact: true, level: 1 })).toBeVisible()
    const cuentaNav = page.getByRole('navigation', { name: 'Secciones de la cuenta' })

    const brand = page.getByText('Sonivo', { exact: true })
    const logout = page.getByRole('button', { name: 'Cerrar sesión' })
    const title = page.getByRole('heading', { name: 'Cuenta', exact: true, level: 1 })
    const activeTab = cuentaNav.getByRole('link', { name: 'Perfil' })

    await expectReadableText(brand)
    await expectReadableText(logout)
    await expectReadableText(title)
    await expectReadableText(activeTab)

    await page.goto('/cuenta/preferencias')
    await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    await page.goto('/cuenta')
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    await expectReadableText(brand)
    await expectReadableText(logout)
    await expectReadableText(title)
    await expectReadableText(activeTab)
  })

  // Wave B (Step 1): the content palette (primary/danger actions and links) must
  // clear AA on the light card surface in BOTH themes, since the card is white
  // regardless of theme.
  test('content actions and links meet AA in light and dark', async ({ page }) => {
    const email = uniqueEmail('w6content')
    await register(page, email)

    await page.goto('/cuenta/preferencias')
    await page.getByRole('button', { name: 'Claro', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Mis grupos', level: 1 })).toBeVisible()
    await expectReadableText(page.getByRole('button', { name: 'Nuevo grupo' }))
    await expectReadableText(page.getByRole('button', { name: 'Unirme con enlace' }).first())

    await page.goto('/cuenta/preferencias')
    await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Mis grupos', level: 1 })).toBeVisible()
    await expectReadableText(page.getByRole('button', { name: 'Nuevo grupo' }))
    await expectReadableText(page.getByRole('button', { name: 'Unirme con enlace' }).first())
  })
})
