import { expect, test } from '@playwright/test'
import {
  createEvent,
  createGroup,
  openEvents,
  register,
  uniqueEmail,
} from './helpers'

/**
 * ADR-0053: `/home` is the Inicio dashboard (greeting, quick actions, my groups,
 * next activity) and the group list lives at `/groups`. The root `/` is the
 * public marketing landing (see DEPLOYMENT.md host layout). Addendum: only
 * "Crear grupo"/"Unirse a grupo" remain, the top search is groups-only and
 * "Ver calendario" opens the general calendar.
 */
test.describe('Home dashboard (ADR-0053)', () => {
  test('shows greeting, quick actions, groups and upcoming activity', async ({ page }) => {
    const email = uniqueEmail('home')
    const groupName = `Home Band ${Date.now()}`
    await register(page, email)
    await createGroup(page, groupName)

    // An upcoming event so the activity rail has content.
    await openEvents(page)
    await createEvent(page, {
      title: 'Ensayo general',
      type: 'rehearsal',
      startsAt: '2031-05-15T19:00',
    })

    await page.goto('/home')
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible()

    await expect(page.getByTestId('home-action-create')).toBeVisible()
    await expect(page.getByTestId('home-action-join')).toBeVisible()
    // Addendum: explore/search quick actions and the learning banner are gone.
    await expect(page.getByTestId('home-action-explore')).toHaveCount(0)
    await expect(page.getByTestId('home-action-search')).toHaveCount(0)
    await expect(page.getByTestId('home-learn-cta')).toHaveCount(0)

    // The top search is groups-only.
    await expect(page.getByPlaceholder('Buscar grupos')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Tus grupos' })).toBeVisible()
    await expect(
      page.getByTestId('home-group-card').filter({ hasText: groupName }),
    ).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Tu próxima actividad' })).toBeVisible()
    await expect(
      page.getByTestId('home-activity-item').filter({ hasText: 'Ensayo general' }),
    ).toBeVisible()

    // "Ver todos" moves to the dedicated group list route.
    await page.getByTestId('home-view-all').click()
    await expect(page).toHaveURL(/\/groups$/)
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
  })

  test('sidebar exposes notifications and the join route', async ({ page }) => {
    await register(page, uniqueEmail('home-nav'))
    await page.goto('/home')

    // Membership remains an account route; notification access uses the existing account inbox.
    // Membership is no longer group-owned: it lives in account settings, so the
    // old billing placeholder is now the real /account/membership route.
    await expect(page.getByTestId('nav-notifications')).toHaveAttribute('href', '/app/account/notifications')
    await expect(page.getByTestId('nav-membership')).toBeVisible()

    await page.getByTestId('nav-notifications').click()
    await expect(page).toHaveURL(/\/app\/account\/notifications$/)
    await expect(page.getByRole('heading', { name: 'Notificaciones de la cuenta' })).toBeVisible()

    await page.getByTestId('nav-join').click()
    await expect(page).toHaveURL(/\/join$/)
    await expect(page.getByRole('heading', { name: 'Unirse a grupo' })).toBeVisible()
  })

  test('limits "Tu próxima actividad" to the next 5 events', async ({ page }) => {
    await register(page, uniqueEmail('home-limit'))
    await page.evaluate(async () => {
      const csrf = await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()
      const headers = { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.token }
      const group = await (
        await fetch('/api/groups', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ name: 'Limit Band' }),
        })
      ).json()
      for (let index = 1; index <= 6; index += 1) {
        const date = new Date()
        date.setDate(date.getDate() + index)
        await fetch(`/api/groups/${group.id}/events`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ title: `Evento ${index}`, type: 'rehearsal', startsAt: date.toISOString() }),
        })
      }
    })

    await page.goto('/home')
    await expect(page.getByTestId('home-activity-item')).toHaveCount(5)
  })
})
