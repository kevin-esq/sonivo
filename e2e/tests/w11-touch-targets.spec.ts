import { expect, test, type Locator } from '@playwright/test'
import { createGroup, register, uniqueEmail } from './helpers'

/**
 * Wave B (Step 2) — interactive targets must meet the 44px guidance on the
 * persona's mobile-first width. WCAG 2.2 `target-size` (AA) requires 24x24 as a
 * hard floor; this suite asserts that floor across a screen and then checks the
 * previously sub-44px controls one by one.
 */

async function box(locator: Locator): Promise<{ w: number; h: number }> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { w: rect.width, h: rect.height }
  })
}

async function expectMinAxis(locator: Locator, min: number, label: string) {
  const { w, h } = await box(locator)
  expect(Math.min(w, h), `${label} is ${Math.round(w)}x${Math.round(h)}`).toBeGreaterThanOrEqual(min)
}

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
].join(',')

async function subTargetOffenders(page: import('@playwright/test').Page, min: number) {
  return page.evaluate(
    ({ selector, threshold }) => {
      const out: Array<{ tag: string; name: string; w: number; h: number }> = []
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        // WCAG 2.2 target-size exempts links rendered inline in a sentence.
        if (style.display === 'inline') continue
        if (rect.width < threshold || rect.height < threshold) {
          out.push({
            tag: el.tagName.toLowerCase(),
            name: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          })
        }
      }
      return out
    },
    { selector: INTERACTIVE, threshold: min },
  )
}

test.describe('W11 touch targets', () => {
  test('auth password reveal meets the 44px target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/register')
    await expect(page.getByLabel('Contraseña')).toBeVisible()
    await expectMinAxis(page.getByRole('button', { name: 'Mostrar' }).first(), 44, 'password reveal')
  })

  test('group rail and mobile chrome meet the 44px target', async ({ page }) => {
    const email = uniqueEmail('w11targets')
    await register(page, email)
    await createGroup(page, `W11 ${Date.now()}`)

    // Desktop: the rail (nav links, footer links, sign-out, brand lockup).
    await page.setViewportSize({ width: 1440, height: 900 })
    const railNav = page.getByRole('navigation', { name: 'Grupo' })
    await expect(railNav).toBeVisible()
    for (const name of ['Inicio', 'Canciones', 'Listas', 'Biblioteca', 'Miembros']) {
      await expectMinAxis(railNav.getByRole('link', { name }), 44, `rail link ${name}`)
    }
    await expectMinAxis(page.getByTestId('rail-settings'), 44, 'rail settings')
    await expectMinAxis(page.getByTestId('rail-brand'), 44, 'brand lockup')

    // Mobile: bottom tab bar + top-bar account/sign-out controls.
    await page.setViewportSize({ width: 390, height: 844 })
    const tabbar = page.getByTestId('mobile-tabbar')
    await expect(tabbar).toBeVisible()
    for (const link of await tabbar.getByRole('link').all()) {
      await expectMinAxis(link, 44, `tab ${(await link.textContent()) ?? ''}`)
    }

    // Hard WCAG 2.2 AA floor: nothing interactive below 24x24 on this screen.
    const offenders = await subTargetOffenders(page, 24)
    expect(offenders, JSON.stringify(offenders)).toEqual([])
  })
})
