import { expect, test } from '@playwright/test'
import {
  acceptInvite,
  createGroup,
  inviteMemberAndReadLink,
  login,
  logout,
  register,
  uniqueEmail,
} from './helpers'

test('bulk role assignment keeps successful changes when a later save fails', async ({ page }) => {
  const stamp = Date.now()
  const ownerEmail = uniqueEmail('partial-role-owner')
  const firstMemberEmail = uniqueEmail(`partial-role-a-${stamp}`)
  const secondMemberEmail = uniqueEmail(`partial-role-b-${stamp}`)
  const firstMemberName = firstMemberEmail.split('@')[0]!
  const secondMemberName = secondMemberEmail.split('@')[0]!
  const groupName = `Partial role band ${stamp}`
  const roleName = `Partial role ${stamp}`

  await register(page, ownerEmail)
  await createGroup(page, groupName)
  const groupId = page.url().match(/\/groups\/([0-9a-f-]+)/i)?.[1]
  expect(groupId).toBeTruthy()

  for (const email of [firstMemberEmail, secondMemberEmail]) {
    const inviteUrl = await inviteMemberAndReadLink(page, email)
    await logout(page)
    await register(page, email)
    await page.goto(inviteUrl)
    await acceptInvite(page)
    await logout(page)
    await login(page, ownerEmail)
    await page.goto(`/groups/${groupId}/people`)
    await expect(page.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  }

  const roleId = await page.evaluate(async ({ targetGroupId, name }) => {
    const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include' })
    if (!csrfResponse.ok) throw new Error(`csrf failed: ${csrfResponse.status}`)
    const { token } = (await csrfResponse.json()) as { token: string }
    const response = await fetch(`/api/groups/${targetGroupId}/roles`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token },
      body: JSON.stringify({ name, permissions: [], extendsBaseRole: true }),
    })
    if (!response.ok) throw new Error(`role creation failed: ${response.status}`)
    return ((await response.json()) as { id: string }).id
  }, { targetGroupId: groupId!, name: roleName })

  await page.goto(`/groups/${groupId}/roles`)
  const roleRow = page.getByTestId('roles-list').locator('li').filter({ hasText: roleName })
  await roleRow.getByRole('button', { name: `Acciones de ${roleName}` }).click()
  await page.getByRole('menuitem', { name: 'Asignar roles' }).click()

  const dialog = page.getByTestId('role-members-dialog')
  await expect(dialog).toBeVisible()
  for (const memberName of [firstMemberName, secondMemberName]) {
    const row = dialog.locator('li').filter({ hasText: memberName })
    await row.getByRole('combobox').click()
    await page.getByRole('option', { name: roleName, exact: true }).click()
  }

  let assignmentRequests = 0
  await page.route(
    new RegExp(`/api/groups/${groupId}/members/[^/]+/group-role$`),
    async (route) => {
      assignmentRequests += 1
      if (assignmentRequests === 2) {
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 503, title: 'Temporary failure' }),
        })
        return
      }
      await route.continue()
    },
  )

  await dialog.getByRole('button', { name: 'Guardar asignaciones' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Asignaciones guardadas antes del error: 1.')
  await expect(dialog.getByText('Cambios pendientes: 1')).toBeVisible()
  await expect(
    dialog.locator('li').filter({ hasText: firstMemberName }).getByRole('combobox'),
  ).toContainText(roleName)

  const assignmentsAfterPartialSave = await page.evaluate(async ({ targetGroupId, names }) => {
    const response = await fetch(`/api/groups/${targetGroupId}/members`, { credentials: 'include' })
    if (!response.ok) throw new Error(`member list failed: ${response.status}`)
    const payload = (await response.json()) as {
      items: Array<{ displayName: string; groupRoleId: string | null }>
    }
    const members = payload.items
    return names.map((name) => members.find((member) => member.displayName === name)?.groupRoleId ?? null)
  }, { targetGroupId: groupId!, names: [firstMemberName, secondMemberName] })
  expect(assignmentsAfterPartialSave).toEqual([roleId, null])

  await dialog.getByRole('button', { name: 'Guardar asignaciones' }).click()
  await expect(dialog).toHaveCount(0)
  expect(assignmentRequests).toBe(3)

  const assignmentsAfterRetry = await page.evaluate(async ({ targetGroupId, names }) => {
    const response = await fetch(`/api/groups/${targetGroupId}/members`, { credentials: 'include' })
    if (!response.ok) throw new Error(`member list failed: ${response.status}`)
    const payload = (await response.json()) as {
      items: Array<{ displayName: string; groupRoleId: string | null }>
    }
    const members = payload.items
    return names.map((name) => members.find((member) => member.displayName === name)?.groupRoleId ?? null)
  }, { targetGroupId: groupId!, names: [firstMemberName, secondMemberName] })
  expect(assignmentsAfterRetry).toEqual([roleId, roleId])
})
