import { expect, test } from '@playwright/test'
import {
  createGroup,
  createSong,
  inviteMemberAndReadLink,
  acceptInvite,
  logout,
  register,
  uniqueEmail,
} from './helpers'

test.describe('Phase 4 product completion', () => {
  test('new owner can follow onboarding, reopen help, and export an authorized report', async ({ page }) => {
    await register(page, uniqueEmail('phase4-owner'))
    await createGroup(page, `Guided Band ${Date.now()}`)
    const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(groupId).toBeTruthy()

    await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible()
    await expect(page.getByText('0 de 4 pasos completados')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Invita a las personas y asigna sus roles' }))
      .toHaveAttribute('href', `/app/groups/${groupId}/people`)
    await page.getByRole('link', { name: 'Añade canciones y arreglos a la biblioteca' }).click()
    await createSong(page, `First song ${Date.now()}`)

    await page.goto(`/groups/${groupId}`)
    await expect(page.getByText('1 de 4 pasos completados')).toBeVisible()
    await page.getByRole('button', { name: 'Ocultar guía' }).click()
    await page.getByRole('button', { name: 'Mostrar guía de inicio' }).click()
    await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible()

    await page.getByTestId('rail-help').click()
    await expect(page).toHaveURL(/\/help$/)
    await expect(page.getByRole('heading', { name: 'Ayuda del grupo' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Preguntas frecuentes' })).toBeVisible()
    await expect(page.getByTestId('rail-help')).toBeVisible()
    await expect(page.getByText('Canciones, arreglos y letras', { exact: true })).toBeVisible()

    await page.goto(`/groups/${groupId}/reports`)
    await expect(page.getByRole('heading', { name: 'Informes del grupo' })).toBeVisible()
    await expect(page.getByText('Miembros actuales: 1')).toBeVisible()
    await expect(page.getByText('No hay eventos en este periodo.')).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Descargar respuestas (CSV)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^sonivo-event-responses-/)
    const stream = await download.createReadStream()
    expect(stream).not.toBeNull()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const csv = Buffer.concat(chunks).toString('utf8')
    expect(csv).toContain('event_id,title,event_type,starts_at_utc,yes,no,maybe,no_response,current_member_count')

    await page.goto(`/groups/${groupId}/settings`)
    await page.getByRole('tab', { name: 'Auditoría' }).click()
    await expect(page.getByText('Exportó un informe del grupo')).toBeVisible()
  })

  test('group member receives a clear denial when opening owner reports', async ({ page }) => {
    const ownerEmail = uniqueEmail('phase4-report-owner')
    const memberEmail = uniqueEmail('phase4-report-member')
    await register(page, ownerEmail)
    await createGroup(page, `Report Access Band ${Date.now()}`)
    const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(groupId).toBeTruthy()

    const invitationUrl = await inviteMemberAndReadLink(page, memberEmail)
    await logout(page)
    await register(page, memberEmail)
    await page.goto(invitationUrl)
    await acceptInvite(page)
    await page.goto(`/groups/${groupId}/reports`)

    await expect(
      page.getByText('Solo la persona propietaria del grupo puede ver estos informes.'),
    ).toBeVisible()
  })

  test('new members get a short guide for using the shared group workspace', async ({ page }) => {
    const ownerEmail = uniqueEmail('phase4-guide-owner')
    const memberEmail = uniqueEmail('phase4-guide-member')
    await register(page, ownerEmail)
    await createGroup(page, `Member Guide Band ${Date.now()}`)
    const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(groupId).toBeTruthy()

    const invitationUrl = await inviteMemberAndReadLink(page, memberEmail)
    await logout(page)
    await register(page, memberEmail)
    await page.goto(invitationUrl)
    await acceptInvite(page)
    await page.goto(`/groups/${groupId}`)

    await expect(page.getByRole('heading', { name: 'Primeros pasos' })).toBeVisible()
    await expect(page.getByText('Aquí tienes lo esencial para participar en tu grupo:')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Consulta las canciones y sus arreglos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Revisa los próximos eventos del grupo' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Abre las guías y preguntas frecuentes' })).toBeVisible()
  })

  test('successful sign-in for a non-member keeps the session and explains the group denial', async ({ page }) => {
    const ownerEmail = uniqueEmail('phase4-branded-owner')
    const outsiderEmail = uniqueEmail('phase4-branded-outsider')
    const groupName = `Branded Login Band ${Date.now()}`
    await register(page, ownerEmail)
    await createGroup(page, groupName)
    const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
    expect(groupId).toBeTruthy()
    const slug = await page.evaluate(async (targetId) => {
      const response = await fetch('/api/groups', { credentials: 'include' })
      const groups = (await response.json()) as { id: string; slug: string }[]
      return groups.find((group) => group.id === targetId)?.slug
    }, groupId)
    expect(slug).toBeTruthy()

    await logout(page)
    await register(page, outsiderEmail)
    await logout(page)
    await page.goto(`/g/${slug}/login`)
    await page.getByLabel(/Correo/).fill(outsiderEmail)
    await page.getByLabel('Contraseña').fill('TestPass1a')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()

    await expect(page.getByRole('heading', { name: 'Esta cuenta no pertenece a este grupo' })).toBeVisible()
    await expect(page.getByText(new RegExp(slug!))).toBeVisible()
    await page.getByRole('link', { name: 'Ir a Sonivo' }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()
  })
})
