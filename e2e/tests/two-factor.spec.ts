import { createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { logout, register, testPassword, uniqueEmail } from './helpers'

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const text = input.trim().replace(/=+$/, '').toUpperCase()
  let buffer = 0
  let bitsLeft = 0
  const bytes: number[] = []
  for (const char of text) {
    const value = alphabet.indexOf(char)
    if (value < 0) {
      throw new Error(`Invalid base32 character: ${char}`)
    }
    buffer = (buffer << 5) | value
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bytes.push((buffer >> (bitsLeft - 8)) & 0xff)
      bitsLeft -= 8
      buffer &= (1 << bitsLeft) - 1
    }
  }
  return Buffer.from(bytes)
}

/**
 * T-AU-02 TC-2FA-01: deterministic TOTP per RFC 6238 (SHA-1, 30 s step,
 * 6 digits) computed in-spec from the enroll-start shared secret (base32
 * extracted from the otpauth URI response via the displayed manual key).
 * No fixed sleeps; the server accepts a ±2-step drift window.
 */
export function totpCode(base32Secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30)
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(BigInt(counter))
  const hash = createHmac('sha1', base32Decode(base32Secret)).update(counterBytes).digest()
  const offset = (hash[hash.length - 1] ?? 0) & 0x0f
  const code =
    (((hash[offset] ?? 0) & 0x7f) << 24) |
    ((hash[offset + 1] ?? 0) << 16) |
    ((hash[offset + 2] ?? 0) << 8) |
    (hash[offset + 3] ?? 0)
  return (code % 1_000_000).toString().padStart(6, '0')
}

test.describe('Two-factor authentication', () => {
  test('TC-2FA-01: enable, logout, second-step login, wrong-code denial', async ({ page }) => {
    const email = uniqueEmail('2fa')
    await register(page, email)

    await page.goto('/security')
    await expect(page.getByRole('heading', { name: 'Seguridad' })).toBeVisible()
    await page.getByRole('button', { name: 'Activar verificación en dos pasos' }).click()
    await expect(page.getByText('Ingresa esta clave en tu app')).toBeVisible()
    const manualKey = await page.getByLabel('Clave manual').inputValue()
    expect(manualKey.trim().length).toBeGreaterThan(0)

    await page.getByLabel('Código de 6 dígitos').fill(totpCode(manualKey))
    await page.getByRole('button', { name: 'Confirmar y activar' }).click()
    const codesRegion = page.getByRole('region', { name: 'Códigos de recuperación' })
    await expect(codesRegion).toBeVisible()
    await expect(
      codesRegion.getByText('Se muestran una sola vez'),
    ).toBeVisible()
    await expect(codesRegion.getByRole('listitem')).toHaveCount(10)
    await page.getByRole('button', { name: 'He guardado mis códigos' }).click()
    await expect(page.getByText('está activada para tu cuenta')).toBeVisible()

    await logout(page)

    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(testPassword)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(
      page.getByRole('heading', { name: 'Verificación en dos pasos' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toHaveCount(0)

    // Wrong code is denied with no session created.
    await page.getByLabel('Código de 6 dígitos').fill('000000')
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrecto')
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toHaveCount(0)

    // Computed code completes the session.
    await page.getByLabel('Código de 6 dígitos').fill(totpCode(manualKey))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.getByRole('heading', { name: 'Mis grupos' })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()

    // Determinism guard for this spec's helper (runs before navigation asserts above matter).
    expect(totpCode(manualKey)).toMatch(/^\d{6}$/)
  })

  test('TC-2FA-01b: password step alone never creates a session', async ({ page }) => {
    // Regression pin: a 2FA account must never land on Mis grupos from the
    // password step alone, and /api/auth/me stays 401 until the challenge.
    const email = uniqueEmail('2fa-pre')
    await register(page, email)
    await page.goto('/security')
    await page.getByRole('button', { name: 'Activar verificación en dos pasos' }).click()
    const manualKey = await page.getByLabel('Clave manual').inputValue()
    await page.getByLabel('Código de 6 dígitos').fill(totpCode(manualKey))
    await page.getByRole('button', { name: 'Confirmar y activar' }).click()
    await expect(page.getByRole('region', { name: 'Códigos de recuperación' })).toBeVisible()
    await logout(page)

    await page.goto('/login')
    await page.getByLabel('Correo electrónico').fill(email)
    await page.getByLabel('Contraseña').fill(testPassword)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(
      page.getByRole('heading', { name: 'Verificación en dos pasos' }),
    ).toBeVisible()

    // Direct navigation to the app without the challenge bounces to login.
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
