import { ApiError, apiRequest, clearCsrfToken, ensureCsrfToken } from './http'

export type CurrentUser = {
  id: string
  email: string | null
  displayName: string | null
  emailConfirmed: boolean
  mustChangePassword?: boolean
  managedByGroupId?: string | null
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiRequest<CurrentUser>('/api/auth/me')
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

export async function changePassword(input: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  await apiRequest('/api/auth/change-password', { method: 'POST', body: input })
}

export async function registerUser(input: {
  email: string
  password: string
  displayName?: string
}): Promise<CurrentUser & { mailed: boolean }> {
  clearCsrfToken()
  await ensureCsrfToken()
  return apiRequest<CurrentUser & { mailed: boolean }>('/api/auth/register', {
    method: 'POST',
    body: input,
  })
}

export async function loginUser(input: {
  email: string
  password: string
  rememberMe?: boolean
}): Promise<CurrentUser | { requiresTwoFactor: true }> {
  clearCsrfToken()
  await ensureCsrfToken()
  const result = await apiRequest<CurrentUser | { requiresTwoFactor: true }>('/api/auth/login', {
    method: 'POST',
    body: input,
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return result
}

/**
 * ADR-0047: managed members without an email sign in as `handle@slug`. Handle and
 * slug are sent separately to the dedicated endpoint; it never consults emails.
 */
export async function loginWithHandle(input: {
  slug: string
  handle: string
  password: string
  rememberMe?: boolean
}): Promise<CurrentUser | { requiresTwoFactor: true }> {
  clearCsrfToken()
  await ensureCsrfToken()
  const result = await apiRequest<CurrentUser | { requiresTwoFactor: true }>(
    `/api/auth/login/handle/${encodeURIComponent(input.slug)}`,
    { method: 'POST', body: { handle: input.handle, password: input.password, rememberMe: input.rememberMe } },
  )
  clearCsrfToken()
  await ensureCsrfToken()
  return result
}

/** T-AU-02: narrows the login union to the 2FA second-step shape. */
export function isSecondStepRequired(
  value: CurrentUser | { requiresTwoFactor: true },
): value is { requiresTwoFactor: true } {
  return (value as { requiresTwoFactor?: unknown }).requiresTwoFactor === true
}

export async function logoutUser(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
  clearCsrfToken()
}

/** T-AU-01: mailbox verification + password recovery. */
export async function confirmEmail(input: {
  email: string
  token: string
}): Promise<{ emailConfirmed: boolean }> {
  return apiRequest<{ emailConfirmed: boolean }>('/api/auth/confirm-email', {
    method: 'POST',
    body: input,
  })
}

export async function resendConfirmation(
  email: string,
): Promise<{ accepted: boolean; mailed: boolean }> {
  return apiRequest<{ accepted: boolean; mailed: boolean }>(
    '/api/auth/resend-confirmation',
    { method: 'POST', body: { email } },
  )
}

export async function forgotPassword(
  email: string,
): Promise<{ accepted: boolean; mailed: boolean }> {
  return apiRequest<{ accepted: boolean; mailed: boolean }>('/api/auth/forgot-password', {
    method: 'POST',
    body: { email },
  })
}

export async function resetPassword(input: {
  email: string
  token: string
  newPassword: string
}): Promise<{ passwordReset: boolean }> {
  return apiRequest<{ passwordReset: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: input,
  })
}

/** T-AU-02: TOTP two-factor authentication (ADR-0038 S2). */
export type TwoFactorStatus = {
  enabled: boolean
  hasPassword: boolean
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  return apiRequest<TwoFactorStatus>('/api/auth/2fa/status')
}

export async function startTwoFactorEnroll(): Promise<{ uri: string; manualKey: string }> {
  return apiRequest<{ uri: string; manualKey: string }>('/api/auth/2fa/enroll-start', {
    method: 'POST',
    body: {},
  })
}

export async function verifyTwoFactorEnroll(
  code: string,
): Promise<{ enabled: boolean; recoveryCodes: string[] }> {
  return apiRequest<{ enabled: boolean; recoveryCodes: string[] }>('/api/auth/2fa/enroll-verify', {
    method: 'POST',
    body: { code },
  })
}

export async function disableTwoFactor(password?: string): Promise<{ disabled: boolean }> {
  return apiRequest<{ disabled: boolean }>('/api/auth/2fa/disable', {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })
}

export async function challengeTwoFactor(
  code: string,
  rememberMe = false,
): Promise<CurrentUser> {
  const user = await apiRequest<CurrentUser>('/api/auth/2fa/challenge', {
    method: 'POST',
    body: { code, rememberMe },
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export async function recoverTwoFactor(code: string): Promise<CurrentUser> {
  const user = await apiRequest<CurrentUser>('/api/auth/2fa/recover', {
    method: 'POST',
    body: { code },
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export async function regenerateRecoveryCodes(
  password?: string,
): Promise<{ recoveryCodes: string[] }> {
  return apiRequest<{ recoveryCodes: string[] }>('/api/auth/2fa/recovery-codes/regenerate', {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })
}

/** T-AU-03: Passkeys / WebAuthn authentication (ADR-0038 S3). */
export type PasskeyItem = {
  id: string
  name: string
  createdAt: string
}

export type PasskeyRegistrationOptions = {
  challenge: string
  rpId: string
  rpName: string
  user: {
    id: string
    name: string
    displayName: string
  }
}

export type PasskeyLoginOptions = {
  challenge: string
  rpId: string
}

export async function fetchPasskeys(): Promise<PasskeyItem[]> {
  return apiRequest<PasskeyItem[]>('/api/auth/passkeys')
}

export async function startPasskeyRegistration(): Promise<PasskeyRegistrationOptions> {
  return apiRequest<PasskeyRegistrationOptions>('/api/auth/passkeys/register-start', {
    method: 'POST',
    body: {},
  })
}

export async function finishPasskeyRegistration(input: {
  attestationObject: string
  clientData: string
  deviceName?: string
}): Promise<{ registered: boolean; credentialId: string }> {
  return apiRequest<{ registered: boolean; credentialId: string }>('/api/auth/passkeys/register-finish', {
    method: 'POST',
    body: input,
  })
}

export async function deletePasskey(id: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function startPasskeyLogin(): Promise<PasskeyLoginOptions> {
  return apiRequest<PasskeyLoginOptions>('/api/auth/passkeys/login-start', {
    method: 'POST',
    body: {},
  })
}

export async function finishPasskeyLogin(input: {
  credentialId: string
  clientData: string
  authenticatorData: string
  signature: string
}): Promise<CurrentUser> {
  clearCsrfToken()
  await ensureCsrfToken()
  const user = await apiRequest<CurrentUser>('/api/auth/passkeys/login-finish', {
    method: 'POST',
    body: input,
  })
  clearCsrfToken()
  await ensureCsrfToken()
  return user
}

export type AuthProviders = {
  google: boolean
}

export async function fetchAuthProviders(): Promise<AuthProviders> {
  return apiRequest<AuthProviders>('/api/auth/providers')
}

/** Full-page navigation into the Google OAuth challenge (not a fetch). */
export function googleChallengeHref(next?: string | null): string {
  if (next) {
    return `/api/auth/google?next=${encodeURIComponent(next)}`
  }
  return '/api/auth/google'
}

export async function updateProfile(displayName: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me', {
    method: 'PATCH',
    body: { displayName },
  })
}
