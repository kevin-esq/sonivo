import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  addArrangementToSetlist,
  applySetlist,
  createArrangement,
  createEvent,
  createFileResource,
  createGroup,
  createSetlist,
  createSong,
  eventPlanItem,
  inviteMemberAndReadLink,
  openEvents,
  openLibrary,
  openSetlists,
  openSong,
  register,
  saveSetlistOrder,
  uniqueEmail,
} from './helpers'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

test.describe('Q9 conductor follow (ADR-0036)', () => {
  test('TC-Q9-01 owner conducts; member follows playhead and sees presence', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const ownerEmail = uniqueEmail('q9-owner')
    const memberEmail = uniqueEmail('q9-member')
    const ownerName = ownerEmail.split('@')[0] ?? 'q9-owner'
    const memberName = memberEmail.split('@')[0] ?? 'q9-member'
    const groupName = `Conductor Band ${stamp}`
    const songTitle = `Conductor Song ${stamp}`
    const arrangementLabel = `Conductor Arr ${stamp}`
    const line1 = `Primera línea director ${stamp}`
    const line2 = `Segunda línea director ${stamp}`
    const line3 = `Tercera línea director ${stamp}`
    const chordProBody = `[Am]${line1}\n[G]${line2}\n[C]${line3}`
    const setlistName = `Conductor set ${stamp}`
    const eventTitle = `Conductor event ${stamp}`

    const ownerCtx = await browser.newContext()
    const memberCtx = await browser.newContext()
    try {
      const ownerPage = await ownerCtx.newPage()
      await register(ownerPage, ownerEmail)
      await createGroup(ownerPage, groupName)
      await openLibrary(ownerPage)
      await createSong(ownerPage, songTitle)
      await openSong(ownerPage, songTitle)
      await createArrangement(ownerPage, arrangementLabel, {
        lyrics: `${line1}\n${line2}\n${line3}`,
        chords: chordProBody,
      })
      await createFileResource(ownerPage, {
        label: `Audio Q9 ${stamp}`,
        filePath: path.join(fixturesDir, 'practice-a.wav'),
        purpose: 'audio',
      })

      // Timing marks so the follower highlight path is exercised too.
      await expect(ownerPage.getByRole('heading', { name: arrangementLabel })).toBeVisible()
      await ownerPage.getByRole('button', { name: 'Editar letra y acordes' }).click()
      await expect(ownerPage.getByTestId('digitizer-studio')).toBeVisible({ timeout: 10_000 })
      for (const [index, time] of ['00:00.500', '00:01.500', '00:02.500'].entries()) {
        const line = ownerPage.getByTestId(`digitizer-line-${index}`)
        await line.getByRole('button', { name: 'Marcar tiempo' }).click()
        await line.getByRole('button', { name: 'Editar hora' }).click()
        await ownerPage.getByRole('textbox', { name: `Inicio del renglón ${index + 1}` }).fill(time)
        await ownerPage.getByRole('button', { name: 'Guardar hora' }).click()
      }
      await ownerPage.getByRole('button', { name: 'Guardar cambios' }).click()
      await expect(ownerPage.getByRole('heading', { name: arrangementLabel })).toBeVisible({
        timeout: 10_000,
      })

      await ownerPage.getByRole('link', { name: groupName, exact: true }).click()
      await expect(ownerPage.getByRole('heading', { name: groupName })).toBeVisible()

      await openSetlists(ownerPage)
      await createSetlist(ownerPage, setlistName)
      await addArrangementToSetlist(ownerPage, `${songTitle} — ${arrangementLabel}`)
      await saveSetlistOrder(ownerPage)

      await openEvents(ownerPage)
      await createEvent(ownerPage, { title: eventTitle, startsAt: '2026-12-01T19:00' })
      await applySetlist(ownerPage)
      await expect(eventPlanItem(ownerPage, songTitle, arrangementLabel)).toBeVisible()

      await ownerPage.getByRole('link', { name: groupName, exact: true }).click()
      await expect(ownerPage.getByRole('heading', { name: groupName })).toBeVisible()
      const inviteUrl = await inviteMemberAndReadLink(ownerPage)

      const memberPage = await memberCtx.newPage()
      await register(memberPage, memberEmail)
      await memberPage.goto(inviteUrl)
      await acceptInvite(memberPage)
      await expect(memberPage.getByRole('heading', { name: groupName })).toBeVisible()

      // Both join the same Event practice room.
      await openEvents(ownerPage)
      await ownerPage.getByRole('link', { name: eventTitle }).click()
      await expect(ownerPage.getByRole('heading', { name: eventTitle })).toBeVisible()
      await ownerPage.getByTestId('ensayar-plan').click()
      await expect(ownerPage.getByTestId('practice-queue')).toBeVisible()

      await openEvents(memberPage)
      await memberPage.getByRole('link', { name: eventTitle }).click()
      await expect(memberPage.getByRole('heading', { name: eventTitle })).toBeVisible()
      await memberPage.getByTestId('ensayar-plan').click()
      await expect(memberPage.getByTestId('practice-queue')).toBeVisible()

      const ownerPanel = ownerPage.getByTestId('conductor-panel')
      const memberPanel = memberPage.getByTestId('conductor-panel')
      await expect(ownerPanel).toBeVisible({ timeout: 15_000 })
      await expect(memberPanel).toBeVisible({ timeout: 15_000 })
      await expect(ownerPanel.getByTestId('conductor-follow-toggle')).toHaveCount(0)
      await expect(ownerPanel.getByTestId('conductor-connection-state')).toHaveText(
        'Transmitiendo como director.',
      )

      // Member enables "Seguir al director" (Follow the conductor).
      const followToggle = memberPage.getByTestId('conductor-follow-toggle')
      await expect(followToggle).toBeVisible()
      await followToggle.click()
      await expect(followToggle).toHaveAttribute('aria-pressed', 'true')

      // Presence shows both musicians on both sides.
      const ownerPresence = ownerPage.getByTestId('conductor-presence')
      const memberPresence = memberPage.getByTestId('conductor-presence')
      await expect
        .poll(async () => ownerPresence.innerText(), { timeout: 15_000 })
        .toContain(memberName)
      await expect
        .poll(async () => memberPresence.innerText(), { timeout: 15_000 })
        .toContain(ownerName)

      // Leader seeks to 2.0s; the follower playhead follows within ~5s.
      const ownerSeek = ownerPage.getByTestId('practice-seek')
      await expect(ownerSeek).toBeEnabled({ timeout: 15_000 })
      await ownerSeek.focus()
      await ownerSeek.press('Home')
      for (let step = 0; step < 20; step += 1) {
        await ownerSeek.press('ArrowRight')
      }
      await expect
        .poll(async () => ownerPage.getByTestId('practice-current-time').innerText(), {
          timeout: 10_000,
        })
        .toBe('0:02')

      const memberSeek = memberPage.getByTestId('practice-seek')
      await expect
        .poll(
          async () => {
            const followerSeconds = Number(await memberSeek.inputValue())
            return Math.abs(followerSeconds - 2) <= 1
          },
          { timeout: 15_000 },
        )
        .toBe(true)

      // Follower ChordPro highlight tracks the broadcast (mark at 1500ms).
      const memberChordPro = memberPage.getByTestId('practice-chordpro')
      await expect(memberChordPro).toBeVisible()
      await expect
        .poll(async () => memberChordPro.locator('[data-active-line="true"]').count(), {
          timeout: 15_000,
        })
        .toBe(1)
      await expect(
        memberChordPro.locator('[data-line-index="1"][data-active-line="true"]'),
      ).toContainText('Segunda línea')
    } finally {
      await ownerCtx.close()
      await memberCtx.close()
    }
  })
})
