import { expect, test } from '@playwright/test'
import {
  createArrangement,
  createGroup,
  createLinkResource,
  createSong,
  openLibrary,
  openPractice,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

test.describe('Practice extras: tuner + YouTube reference (T-FX-01–02)', () => {
  test('TC-PITCH-01 tuner opens with stubbed mic and shows note display', async ({ page }) => {
    const email = uniqueEmail('tuner-owner')
    const groupName = `Tuner Band ${Date.now()}`
    const songTitle = `Tuner Song ${Date.now()}`
    const arrangementLabel = `Tuner Arr ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, {
      lyrics: `Letra afinador ${Date.now()}`,
    })
    await openPractice(page)

    const toggle = page.getByTestId('tuner-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveText('Abrir afinador')
    await expect(page.getByTestId('tuner-hint')).toContainText('HTTPS o localhost')

    // Stub getUserMedia with a real (silent) MediaStream so the AudioWorklet
    // / AnalyserNode capture path runs without hardware.
    await page.addInitScript(() => {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      let silent: MediaStream | null = null
      try {
        const ctx = new Ctor!()
        silent = ctx.createMediaStreamDestination().stream
      } catch {
        silent = new MediaStream()
      }
      const getUserMedia = async () => silent!
      const devices = navigator.mediaDevices as unknown as {
        getUserMedia?: () => Promise<MediaStream>
      }
      if (devices && typeof devices.getUserMedia === 'function') {
        devices.getUserMedia = getUserMedia
      } else {
        Object.defineProperty(navigator, 'mediaDevices', {
          value: { getUserMedia },
          configurable: true,
        })
      }
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Letra' })).toBeVisible()

    await page.getByTestId('tuner-toggle').click()
    await expect(page.getByTestId('tuner-toggle')).toHaveText('Cerrar')
    await expect(page.getByTestId('tuner-panel')).toBeVisible()
    // Note display appears (silence → placeholder dash, not a crash).
    await expect(page.getByTestId('tuner-note')).toBeVisible()
    await expect(page.getByTestId('tuner-hz')).toBeVisible()
    await expect(page.getByTestId('tuner-cents')).toBeVisible()
    await expect(page.getByTestId('tuner-error')).toHaveCount(0)

    await page.getByTestId('tuner-toggle').click()
    await expect(page.getByTestId('tuner-toggle')).toHaveText('Abrir afinador')
  })

  test('TC-PITCH-01 tuner denied mic shows clear Spanish copy', async ({ page }) => {
    const email = uniqueEmail('tuner-denied')
    const groupName = `Denied Band ${Date.now()}`
    const songTitle = `Denied Song ${Date.now()}`
    const arrangementLabel = `Denied Arr ${Date.now()}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, {
      lyrics: `Letra denegada ${Date.now()}`,
    })
    await openPractice(page)

    await page.addInitScript(() => {
      const getUserMedia = async (): Promise<MediaStream> => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
      const devices = navigator.mediaDevices as unknown as {
        getUserMedia?: () => Promise<MediaStream>
      }
      if (devices && typeof devices.getUserMedia === 'function') {
        devices.getUserMedia = getUserMedia
      } else {
        Object.defineProperty(navigator, 'mediaDevices', {
          value: { getUserMedia },
          configurable: true,
        })
      }
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Letra' })).toBeVisible()

    await page.getByTestId('tuner-toggle').click()
    await expect(page.getByTestId('tuner-error')).toContainText('micrófono')
  })

  test('TC-YT-01 reference YouTube link renders nocookie iframe and disables follow-along', async ({
    page,
  }) => {
    const stamp = Date.now()
    const email = uniqueEmail('yt-owner')
    const groupName = `YT Band ${stamp}`
    const songTitle = `YT Song ${stamp}`
    const arrangementLabel = `YT Arr ${stamp}`
    const videoId = 'dQw4w9WgXcQ'
    const lyricsLine1 = `Primera línea referencia ${stamp}`
    const lyricsLine2 = `Segunda línea referencia ${stamp}`
    const chordProBody = `[Am]${lyricsLine1}\n[G]${lyricsLine2}`

    await register(page, email)
    await createGroup(page, groupName)
    await openLibrary(page)
    await createSong(page, songTitle)
    await openSong(page, songTitle)
    await createArrangement(page, arrangementLabel, { chords: chordProBody })
    await createLinkResource(page, {
      label: `Video referencia ${stamp}`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      purpose: 'reference',
    })
    await createLinkResource(page, {
      label: `Enlace normal ${stamp}`,
      url: 'https://example.com/partitura.pdf',
      purpose: 'reference',
    })

    // Timing marks (no file audio): follow-along must stay disabled on
    // YouTube-sourced Practice with an explanation.
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible()
    await page.getByRole('button', { name: 'Editar arreglo' }).click()
    await expect(page.getByTestId('chord-timing-editor')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('timing-line-0-ms').fill('500')
    await page.getByTestId('timing-line-1-ms').fill('1500')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('heading', { name: arrangementLabel })).toBeVisible({
      timeout: 10_000,
    })

    await openPractice(page)

    await expect(page.getByRole('heading', { name: 'Referencia' })).toBeVisible()
    const iframe = page.getByTestId('reference-iframe')
    await expect(iframe).toBeVisible()
    await expect(iframe).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/${videoId}`,
    )
    // Unparseable URL keeps the current link rendering.
    await expect(page.getByTestId('reference-link')).toContainText('https://example.com/partitura.pdf')

    const followToggle = page.getByTestId('practice-follow-along')
    await expect(followToggle).toBeVisible()
    await expect(followToggle).toBeDisabled()
    await expect(page.getByTestId('practice-follow-along-youtube-note')).toContainText(
      'YouTube',
    )
  })
})
