import { expect, type Page } from '@playwright/test'

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

/** Meets Identity password rules (length, upper, lower, digit). */
export const testPassword = 'TestPass1a'

export async function register(page: Page, email: string, password = testPassword) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill(email.split('@')[0] ?? 'e2e')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Register' }).click()
  await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
}

export async function login(page: Page, email: string, password = testPassword) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'My groups' })).toBeVisible()
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
}

export async function createGroup(page: Page, name: string) {
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create group' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(page.getByText('Owner', { exact: true })).toBeVisible()
}

export async function openLibrary(page: Page) {
  await page.getByRole('link', { name: 'Song library' }).click()
  await expect(page.getByRole('heading', { name: 'Song library' })).toBeVisible()
}

export async function createSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add song' }).click()
  await expect(page.getByRole('heading', { name: 'Create song' })).toBeVisible()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Origin').selectOption('original')
  await page.getByRole('button', { name: 'Create song' }).click()
  await expect(page.getByRole('link', { name: title })).toBeVisible()
}

export async function openSong(page: Page, title: string) {
  await page.getByRole('link', { name: title }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

export async function createArrangement(page: Page, label: string) {
  await page.getByRole('button', { name: 'Add arrangement' }).click()
  await expect(page.getByRole('heading', { name: 'Create arrangement' })).toBeVisible()
  await page.getByLabel('Label', { exact: true }).fill(label)
  await page.getByRole('button', { name: 'Create arrangement' }).click()
  // Create navigates to the new arrangement detail.
  await expect(page.getByRole('heading', { name: label })).toBeVisible()
}

export async function createLinkResource(
  page: Page,
  input: { label: string; url: string; purpose?: string },
) {
  await page.getByRole('button', { name: 'Add link resource' }).click()
  await expect(page.getByRole('heading', { name: 'Add link resource' })).toBeVisible()
  await page.getByLabel('Purpose').selectOption(input.purpose ?? 'practice')
  await page.getByLabel('Label', { exact: true }).fill(input.label)
  await page.getByLabel('URL').fill(input.url)
  await page.getByRole('button', { name: 'Create link' }).click()
  await expect(page.getByText(input.label, { exact: true })).toBeVisible()
  const link = page.getByRole('link', { name: input.url })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', input.url)
  await expect(link).toHaveAttribute('target', '_blank')
}

export async function deleteSong(page: Page, title: string) {
  await page.getByRole('button', { name: 'Delete song' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete song?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete song' }).click()
  await expect(page.getByRole('heading', { name: 'Song library' })).toBeVisible()
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
}

export async function openSetlists(page: Page) {
  await page.getByRole('link', { name: 'Setlists' }).first().click()
  await expect(page.getByRole('heading', { name: 'Setlists' })).toBeVisible()
}

export async function createSetlist(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add setlist' }).click()
  await expect(page.getByRole('heading', { name: 'Create setlist' })).toBeVisible()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create setlist' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

export async function addArrangementToSetlist(page: Page, optionLabel: string) {
  await page.getByLabel('Live arrangement').selectOption({ label: optionLabel })
  await page.getByRole('button', { name: 'Add to setlist' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: optionLabel }).last()).toBeVisible()
}

export async function saveSetlistOrder(page: Page) {
  await page.getByRole('button', { name: 'Save order' }).click()
  await expect(page.getByRole('button', { name: 'Save order' })).toBeEnabled()
}

export async function openEvents(page: Page) {
  await page.getByRole('link', { name: 'Events' }).first().click()
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible()
}

export async function createEvent(
  page: Page,
  input: { title: string; type?: 'rehearsal' | 'performance' | 'other'; startsAt: string },
) {
  await page.getByRole('button', { name: 'Add event' }).click()
  await expect(page.getByRole('heading', { name: 'Create event' })).toBeVisible()
  await page.getByLabel('Title').fill(input.title)
  await page.getByLabel('Type').selectOption(input.type ?? 'rehearsal')
  await page.getByLabel('Starts at').fill(input.startsAt)
  await page.getByRole('button', { name: 'Create event' }).click()
  await expect(page.getByRole('heading', { name: input.title })).toBeVisible()
}

export async function applySetlist(page: Page) {
  await page.getByRole('button', { name: 'Apply setlist' }).click()
}

export async function inviteMemberAndReadLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Invite member' }).click()
  const inviteLink = page.getByLabel('Invite link')
  await expect(inviteLink).toBeVisible()
  const url = await inviteLink.inputValue()
  expect(url).toContain('/join/')
  return url
}

export async function acceptInvite(page: Page) {
  await expect(page.getByRole('heading', { name: 'Join this group' })).toBeVisible()
  await page.getByRole('button', { name: 'Accept invite' }).click()
}

export async function openPeople(page: Page) {
  await page.getByRole('link', { name: 'People' }).click()
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
}

export function attendanceRegion(page: Page) {
  return page.getByRole('region', { name: 'Attendance' })
}

export async function setRsvpYes(page: Page) {
  const attendance = attendanceRegion(page)
  await expect(attendance).toBeVisible()
  await attendance.getByRole('button', { name: 'Yes' }).click()
  await expect(attendance.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true')
}
