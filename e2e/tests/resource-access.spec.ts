import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  acceptInvite,
  createArrangement,
  createFileResource,
  createGroup,
  createSong,
  inviteMemberAndReadLink,
  login,
  logout,
  openLibrary,
  openSong,
  register,
  uniqueEmail,
} from './helpers'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

async function createCustomRole(page: Parameters<typeof register>[0], groupId: string) {
  const status = await page.evaluate(async (targetGroupId) => {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
    if (!csrfResponse.ok) throw new Error(`csrf failed: ${csrfResponse.status}`)
    const { token } = (await csrfResponse.json()) as { token: string }
    const response = await fetch(`/api/groups/${targetGroupId}/roles`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ name: 'Acceso de prueba', permissions: [], extendsBaseRole: true }),
    })
    return response.status
  }, groupId)
  expect(status).toBe(201)
}

test('owner can set inherited read access at song, arrangement, and resource levels', async ({ page }) => {
  const stamp = Date.now()
  const ownerEmail = uniqueEmail('resource-access-owner')
  const memberEmail = uniqueEmail('resource-access-member')
  const memberName = memberEmail.split('@')[0]!
  const groupName = `Access Band ${stamp}`
  const songTitle = `Access song ${stamp}`
  const arrangementLabel = `Access arrangement ${stamp}`
  const resourceLabel = `Access resource ${stamp}`
  const arrangementDeniedSongTitle = `Arrangement denied song ${stamp}`
  const arrangementDeniedLabel = `Arrangement denied ${stamp}`
  const arrangementDeniedResourceLabel = `Child allow ${stamp}`
  const resourceDeniedSongTitle = `Resource denied song ${stamp}`
  const resourceDeniedArrangementLabel = `Resource denied arrangement ${stamp}`
  const resourceDeniedLabel = `Resource denied ${stamp}`

  await register(page, ownerEmail)
  await createGroup(page, groupName)
  const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
  expect(groupId).toBeTruthy()

  await openLibrary(page)
  await createSong(page, songTitle)
  await openSong(page, songTitle)
  await createArrangement(page, arrangementLabel)
  await createFileResource(page, {
    label: resourceLabel,
    filePath: path.join(fixturesDir, 'sample-chart.txt'),
    purpose: 'chart',
  })
  await openLibrary(page)
  await createSong(page, arrangementDeniedSongTitle)
  await openSong(page, arrangementDeniedSongTitle)
  await createArrangement(page, arrangementDeniedLabel)
  await createFileResource(page, {
    label: arrangementDeniedResourceLabel,
    filePath: path.join(fixturesDir, 'sample-chart.txt'),
    purpose: 'chart',
  })
  await openLibrary(page)
  await createSong(page, resourceDeniedSongTitle)
  await openSong(page, resourceDeniedSongTitle)
  await createArrangement(page, resourceDeniedArrangementLabel)
  await createFileResource(page, {
    label: resourceDeniedLabel,
    filePath: path.join(fixturesDir, 'sample-chart.txt'),
    purpose: 'chart',
  })
  const accessTargets = await page.evaluate(async ({ targetGroupId, labels }) => {
    const songsResponse = await fetch(`/api/groups/${targetGroupId}/songs`, { credentials: 'include' })
    if (!songsResponse.ok) throw new Error(`songs failed: ${songsResponse.status}`)
    const songs = (await songsResponse.json()) as Array<{ id: string; title: string }>
    const result: Record<string, { songId: string; arrangementId: string; resourceId: string }> = {}
    for (const target of labels) {
      const song = songs.find((item) => item.title === target.songTitle)
      if (!song) throw new Error(`Created song '${target.songTitle}' was not returned by the group API.`)
      const arrangementsResponse = await fetch(
        `/api/groups/${targetGroupId}/songs/${song.id}/arrangements`,
        { credentials: 'include' },
      )
      if (!arrangementsResponse.ok) throw new Error(`arrangements failed: ${arrangementsResponse.status}`)
      const arrangements = (await arrangementsResponse.json()) as Array<{ id: string; label: string }>
      const arrangement = arrangements.find((item) => item.label === target.arrangementLabel)
      if (!arrangement) throw new Error(`Created arrangement '${target.arrangementLabel}' was not returned.`)
      const resourcesResponse = await fetch(
        `/api/groups/${targetGroupId}/arrangements/${arrangement.id}/resources`,
        { credentials: 'include' },
      )
      if (!resourcesResponse.ok) throw new Error(`resources failed: ${resourcesResponse.status}`)
      const resources = (await resourcesResponse.json()) as Array<{ id: string; label: string }>
      const resource = resources.find((item) => item.label === target.resourceLabel)
      if (!resource) throw new Error(`Created resource '${target.resourceLabel}' was not returned.`)
      result[target.songTitle] = {
        songId: song.id,
        arrangementId: arrangement.id,
        resourceId: resource.id,
      }
    }
    return result
  }, {
    targetGroupId: groupId,
    labels: [
      { songTitle, arrangementLabel, resourceLabel },
      {
        songTitle: arrangementDeniedSongTitle,
        arrangementLabel: arrangementDeniedLabel,
        resourceLabel: arrangementDeniedResourceLabel,
      },
      {
        songTitle: resourceDeniedSongTitle,
        arrangementLabel: resourceDeniedArrangementLabel,
        resourceLabel: resourceDeniedLabel,
      },
    ],
  })

  const inviteUrl = await inviteMemberAndReadLink(page)
  await logout(page)
  await register(page, memberEmail)
  await page.goto(inviteUrl)
  await acceptInvite(page)
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible()

  await logout(page)
  await login(page, ownerEmail)
  await createCustomRole(page, groupId!)
  await page.goto(`/groups/${groupId}/roles`)

  await expect(page.getByText('Los roles del sistema son fijos y no se pueden editar.')).toBeVisible()
  await page.getByRole('button', { name: /Administración/ }).click()
  await expect(page.getByRole('switch')).toHaveCount(0)

  const customRoleCard = page
    .getByTestId('roles-list')
    .locator('li')
    .filter({ hasText: 'Acceso de prueba' })
  await customRoleCard.getByRole('button').first().click()
  await page.getByRole('button', { name: /Canciones/ }).click()
  await expect(page.getByRole('switch', { name: 'Crear canciones' })).toBeVisible()

  const roleActions = page.getByRole('button', { name: 'Acciones de Acceso de prueba' })
  await expect(roleActions).toBeVisible()
  await roleActions.click()
  const originalDocumentOverflow = await page.evaluate(() => document.documentElement.style.overflow)
  await page.getByRole('menuitem', { name: 'Asignar roles' }).click()
  await expect(page.getByTestId('role-members-dialog')).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden')

  const memberAccessButton = page.getByRole('button', {
    name: `Administrar el acceso al contenido de ${memberName}`,
  })
  await expect(memberAccessButton).toBeVisible()
  await memberAccessButton.click()

  const dialog = page.getByTestId('member-resource-access-dialog')
  await expect(dialog.getByRole('heading', { name: 'Acceso al contenido' })).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe('hidden')
  await page.setViewportSize({ width: 390, height: 844 })
  const dialogBounds = await dialog.boundingBox()
  expect(dialogBounds).not.toBeNull()
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.y).toBeGreaterThanOrEqual(0)
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(390)
  const accessibility = await new AxeBuilder({ page })
    .include('[data-testid="member-resource-access-dialog"]')
    .analyze()
  expect(accessibility.violations.map((violation) => violation.id)).toEqual([])
  await expect(dialog.getByLabel(`Acceso a ${songTitle}`)).toHaveValue('inherit')
  await dialog.getByLabel(`Acceso a ${songTitle}`).selectOption('deny')
  const parentDeniedSong = dialog.getByRole('listitem').filter({ hasText: songTitle })
  await parentDeniedSong.locator('summary').first().click()

  const arrangementAccess = dialog.getByLabel(`Acceso a ${arrangementLabel}`)
  await expect(arrangementAccess).toBeVisible()
  await arrangementAccess.selectOption('allow')
  await expect(dialog.getByText('Bloqueado por el nivel superior').first()).toBeVisible()
  await parentDeniedSong.locator('summary').nth(1).click()

  const resourceAccess = dialog.getByLabel(`Acceso a ${resourceLabel}`)
  await expect(resourceAccess).toBeVisible()
  await resourceAccess.selectOption('allow')
  await expect(resourceAccess).toHaveValue('allow')

  const arrangementDeniedSong = dialog.getByRole('listitem').filter({ hasText: arrangementDeniedSongTitle })
  await arrangementDeniedSong.locator('summary').first().click()
  const deniedArrangementAccess = dialog.getByLabel(`Acceso a ${arrangementDeniedLabel}`)
  await expect(deniedArrangementAccess).toBeVisible()
  await deniedArrangementAccess.selectOption('deny')
  await arrangementDeniedSong.locator('summary').nth(1).click()
  const childAllowAccess = dialog.getByLabel(`Acceso a ${arrangementDeniedResourceLabel}`)
  await expect(childAllowAccess).toBeVisible()
  await childAllowAccess.selectOption('allow')
  await expect(dialog.getByText('Bloqueado por el nivel superior').last()).toBeVisible()

  const resourceDeniedSong = dialog.getByRole('listitem').filter({ hasText: resourceDeniedSongTitle })
  await resourceDeniedSong.locator('summary').first().click()
  await expect(dialog.getByLabel(`Acceso a ${resourceDeniedArrangementLabel}`)).toBeVisible()
  await resourceDeniedSong.locator('summary').nth(1).click()
  const deniedResourceAccess = dialog.getByLabel(`Acceso a ${resourceDeniedLabel}`)
  await expect(deniedResourceAccess).toBeVisible()
  await deniedResourceAccess.selectOption('deny')
  await expect(deniedResourceAccess).toHaveValue('deny')

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('role-members-dialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe(originalDocumentOverflow)

  await page.setViewportSize({ width: 1280, height: 900 })
  await logout(page)
  await login(page, memberEmail)
  const memberAccess = await page.evaluate(async ({ targetGroupId, targets }) => {
    const songsResponse = await fetch(`/api/groups/${targetGroupId}/songs`, { credentials: 'include' })
    const songs = (await songsResponse.json()) as Array<{ id: string; title: string }>
    const parentDeniedResponse = await fetch(
      `/api/groups/${targetGroupId}/arrangements/${targets.parentDenied.arrangementId}`,
      { credentials: 'include' },
    )
    const arrangementListResponse = await fetch(
      `/api/groups/${targetGroupId}/songs/${targets.arrangementDenied.songId}/arrangements`,
      { credentials: 'include' },
    )
    const arrangementList = arrangementListResponse.ok
      ? await arrangementListResponse.json() as Array<{ id: string }>
      : null
    const resourceArrangementResponse = await fetch(
      `/api/groups/${targetGroupId}/arrangements/${targets.resourceDenied.arrangementId}`,
      { credentials: 'include' },
    )
    const resourceArrangement = resourceArrangementResponse.ok
      ? await resourceArrangementResponse.json() as { resources: Array<{ id: string }> }
      : null
    const resourceListResponse = await fetch(
      `/api/groups/${targetGroupId}/arrangements/${targets.resourceDenied.arrangementId}/resources`,
      { credentials: 'include' },
    )
    const resourceList = resourceListResponse.ok
      ? await resourceListResponse.json() as Array<{ id: string }>
      : null
    const downloadResponse = await fetch(
      `/api/groups/${targetGroupId}/arrangements/${targets.resourceDenied.arrangementId}/resources/${targets.resourceDenied.resourceId}/content`,
      { credentials: 'include' },
    )
    return {
      songTitles: songs.map((song) => song.title),
      parentDeniedStatus: parentDeniedResponse.status,
      arrangementListStatus: arrangementListResponse.status,
      arrangementIds: arrangementList?.map((item) => item.id) ?? null,
      resourceArrangementStatus: resourceArrangementResponse.status,
      nestedResourceIds: resourceArrangement?.resources.map((item) => item.id) ?? null,
      resourceListStatus: resourceListResponse.status,
      resourceIds: resourceList?.map((item) => item.id) ?? null,
      downloadStatus: downloadResponse.status,
    }
  }, {
    targetGroupId: groupId!,
    targets: {
      parentDenied: accessTargets[songTitle]!,
      arrangementDenied: accessTargets[arrangementDeniedSongTitle]!,
      resourceDenied: accessTargets[resourceDeniedSongTitle]!,
    },
  })

  expect(memberAccess.songTitles).not.toContain(songTitle)
  expect(memberAccess.songTitles).toContain(arrangementDeniedSongTitle)
  expect(memberAccess.songTitles).toContain(resourceDeniedSongTitle)
  expect(memberAccess.parentDeniedStatus).not.toBe(200)
  expect(memberAccess.arrangementListStatus).toBe(200)
  expect(memberAccess.arrangementIds).not.toContain(accessTargets[arrangementDeniedSongTitle]!.arrangementId)
  expect(memberAccess.resourceArrangementStatus).toBe(200)
  expect(memberAccess.nestedResourceIds).not.toContain(accessTargets[resourceDeniedSongTitle]!.resourceId)
  expect(memberAccess.resourceListStatus).toBe(200)
  expect(memberAccess.resourceIds).not.toContain(accessTargets[resourceDeniedSongTitle]!.resourceId)
  expect(memberAccess.downloadStatus).not.toBe(200)

  const childAllowStatus = await page.evaluate(async ({ targetGroupId, targetArrangementId }) => {
    const response = await fetch(
      `/api/groups/${targetGroupId}/arrangements/${targetArrangementId}`,
      { credentials: 'include' },
    )
    return response.status
  }, { targetGroupId: groupId!, targetArrangementId: accessTargets[songTitle]!.arrangementId })
  expect(childAllowStatus).not.toBe(200)
})
