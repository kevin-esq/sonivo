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
