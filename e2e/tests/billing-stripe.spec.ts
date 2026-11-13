import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { acceptInvite, createGroup, inviteMemberAndReadLink, register, uniqueEmail } from './helpers'

test('an account starts Banda trial before creating its first Group', async ({ page }) => {
  test.skip(process.env.SONIVO_E2E_BILLING_STRIPE !== '1', 'Requires an isolated API with Payments:Provider=stripe.')
  await register(page, uniqueEmail('stripe-billing'))
  await page.goto('/app/account/membership')
  await expect(page.getByRole('heading', { name: 'Membresía', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar prueba de Banda' })).toBeVisible()
  await page.goto('/app/groups')
  await expect(page.getByRole('button', { name: 'Nuevo grupo' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unirme con enlace' })).toBeVisible()

  await page.goto('/app/account/membership')
  await page.getByRole('button', { name: 'Iniciar prueba de Banda' }).click()
  await expect(page.getByRole('region', { name: 'Plan Banda activo' })).toContainText('no genera un cobro automático')
  await page.getByRole('link', { name: 'Crear mi primer grupo' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Crear grupo' })
  await expect(createDialog).toBeVisible()
  await createDialog.getByLabel('Nombre').fill(`Stripe Billing ${Date.now()}`)
  const createResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/groups') && response.request().method() === 'POST')
  await createDialog.getByRole('button', { name: 'Crear grupo' }).click()
  const created = await createResponse
  expect(created.status()).toBe(201)
  await expect(page.getByRole('heading', { name: /Stripe Billing/ })).toBeVisible()

  await page.goto('/app/account/membership')
  await page.getByRole('button', { name: 'Explorar planes' }).click()
  await expect(page.getByRole('dialog', { name: 'Elige el plan de tu cuenta' }).getByRole('button', { name: 'Revisar cambio' })).toBeDisabled()
})

test('an account without a plan can join an existing Group but cannot create one', async ({ page, browser }) => {
  test.skip(process.env.SONIVO_E2E_BILLING_STRIPE !== '1', 'Requires an isolated API with Payments:Provider=stripe.')
  const ownerEmail = uniqueEmail('billing-owner')
  const memberEmail = uniqueEmail('billing-member')
  const groupName = `Billing Invite ${Date.now()}`

  await register(page, ownerEmail)
  await page.goto('/app/account/membership')
  await page.getByRole('button', { name: 'Iniciar prueba de Banda' }).click()
  await page.getByRole('link', { name: 'Crear mi primer grupo' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Crear grupo' })
  await createDialog.getByLabel('Nombre').fill(groupName)
  await createDialog.getByRole('button', { name: 'Crear grupo' }).click()
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
  const inviteUrl = await inviteMemberAndReadLink(page)

  const memberContext = await browser.newContext()
  const memberPage = await memberContext.newPage()
  try {
    await register(memberPage, memberEmail)
    await memberPage.goto('/app/groups')
    await expect(memberPage.getByRole('button', { name: 'Nuevo grupo' })).toHaveCount(0)
    await expect(memberPage.getByRole('button', { name: 'Unirme con enlace' })).toBeVisible()
    const blockedCreate = await memberPage.evaluate(async () => {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'include' })
      const { token } = await csrf.json() as { token: string }
      const response = await fetch('/api/groups', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
        body: JSON.stringify({ name: 'Blocked member Group' }),
      })
      return { status: response.status, body: await response.json() }
    })
    expect(blockedCreate.status).toBe(409)
    expect(blockedCreate.body.detail).toBe('billing-active-plan-required')

    await memberPage.goto(inviteUrl)
    await acceptInvite(memberPage)
    await expect(memberPage.getByRole('heading', { name: groupName })).toBeVisible()
    await expect(memberPage.getByTestId('rail-brand').getByText('Miembro', { exact: true })).toBeVisible()
    await memberPage.goto('/app/groups')
    await expect(memberPage.getByRole('button', { name: 'Nuevo grupo' })).toHaveCount(0)
  } finally {
    await memberContext.close()
  }
})

test('account membership reads the API catalog and keeps checkout disabled without sandbox credentials', async ({ page }) => {
  test.skip(process.env.SONIVO_E2E_BILLING_STRIPE !== '1', 'Requires the isolated Stripe-provider API.')
  test.setTimeout(120_000)
  const outputDir = path.resolve(process.cwd(), '../output/playwright/membership-live-integration')
  const axeFindings: string[] = []
  await mkdir(outputDir, { recursive: true })
  await page.addInitScript(() => localStorage.setItem('sonivo:theme', 'dark'))
  await page.setViewportSize({ width: 1440, height: 960 })
  await register(page, uniqueEmail('membership-live'))
  await page.goto('/app/account/membership')
  await page.getByRole('button', { name: 'Iniciar prueba de Banda' }).click()
  await expect(page.getByRole('region', { name: 'Plan Banda activo' })).toBeVisible()
  await page.goto('/app/groups')
  await createGroup(page, `Membership E2E ${Date.now()}`)

  const catalogResponse = page.waitForResponse(response =>
    response.url().endsWith('/api/plans') && response.request().method() === 'GET')
  await page.goto('/app/account/membership')
  const catalog = await (await catalogResponse).json()
  expect(catalog.plans.map((plan: { id: string; priceMonthlyMxn: number }) => [plan.id, plan.priceMonthlyMxn]))
    .toEqual([['starter', 99], ['pro', 199], ['studio', 499]])
  await expect(page.getByRole('heading', { name: 'Membresía', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Plan Banda activo' })).toBeVisible()
  await page.screenshot({ path: path.join(outputDir, 'membership-desktop-dark.png') })

  const explore = page.getByRole('button', { name: 'Explorar planes' })
  await explore.click()
  const dialog = page.getByRole('dialog', { name: 'Elige el plan de tu cuenta' })
  await expect(dialog).toBeVisible()
  const desktopPlans = dialog.locator('fieldset label')
  await expect(desktopPlans).toHaveCount(3)
  for (const [index, [name, price]] of [['Dúo', '99'], ['Banda', '199'], ['Estudio', '499']].entries()) {
    await expect(desktopPlans.nth(index)).toContainText(name)
    await expect(desktopPlans.nth(index)).toContainText(price)
  }
  await expect(dialog.getByRole('button', { name: 'Revisar cambio' })).toBeDisabled()
  await page.screenshot({ path: path.join(outputDir, 'selector-desktop-dark.png') })
  axeFindings.push(...(await new AxeBuilder({ page }).include('dialog[aria-labelledby="plan-selection-title"]').analyze()).violations.map(violation => `${violation.id}: ${violation.nodes.map(node => `${node.target.join(' ')} ${node.failureSummary}`).join(' | ')}`))

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(explore).toBeFocused()

  await page.evaluate(() => {
    localStorage.setItem('sonivo:theme', 'light')
    document.documentElement.dataset.theme = 'light'
  })
  await explore.click()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: path.join(outputDir, 'selector-desktop-light.png') })
  axeFindings.push(...(await new AxeBuilder({ page }).include('dialog[aria-labelledby="plan-selection-title"]').analyze()).violations.map(violation => `${violation.id}: ${violation.nodes.map(node => `${node.target.join(' ')} ${node.failureSummary}`).join(' | ')}`))
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    localStorage.setItem('sonivo:theme', 'dark')
    document.documentElement.dataset.theme = 'dark'
  })
  await explore.click()
  await expect(dialog.getByRole('tab', { name: /Dúo/ })).toBeVisible()
  await dialog.getByRole('tab', { name: /Dúo/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('tab', { name: /Banda/ })).toBeFocused()
  await expect(dialog.getByRole('tabpanel').getByRole('heading', { name: 'Banda' })).toBeVisible()
  for (const [name, price] of [['Dúo', '99'], ['Banda', '199'], ['Estudio', '499']]) {
    await dialog.getByRole('tab', { name: new RegExp(name) }).click()
    await expect(dialog.getByRole('tabpanel').getByRole('heading', { name })).toBeVisible()
    await expect(dialog.getByRole('tabpanel')).toContainText(price)
  }
  await expect(dialog.getByRole('button', { name: 'Revisar cambio' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(outputDir, 'selector-mobile-dark.png') })
  axeFindings.push(...(await new AxeBuilder({ page }).include('dialog[aria-labelledby="plan-selection-title"]').analyze()).violations.map(violation => `${violation.id}: ${violation.nodes.map(node => `${node.target.join(' ')} ${node.failureSummary}`).join(' | ')}`))

  await page.evaluate(() => {
    localStorage.setItem('sonivo:theme', 'light')
    document.documentElement.dataset.theme = 'light'
  })
  await page.screenshot({ path: path.join(outputDir, 'selector-mobile-light.png') })
  axeFindings.push(...(await new AxeBuilder({ page }).include('dialog[aria-labelledby="plan-selection-title"]').analyze()).violations.map(violation => `${violation.id}: ${violation.nodes.map(node => `${node.target.join(' ')} ${node.failureSummary}`).join(' | ')}`))
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(explore).toBeFocused()
  expect(axeFindings).toEqual([])

  await page.route('**/api/plans', route => route.abort())
  await page.goto('/app/account/membership')
  await expect(page.locator('p[role="alert"]')).toContainText('No se pudo cargar la información')
})
