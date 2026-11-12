export const pendingReferralCodeKey = 'sonivo:pending-referral-code'

export function isReferralCode(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9-]{16,32}$/.test(value)
}
