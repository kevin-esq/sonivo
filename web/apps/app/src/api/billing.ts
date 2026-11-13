import { apiRequest } from './http'

export type PaymentProviderStatus = {
  provider: 'manual' | 'sandbox' | 'stripe'
  configured: boolean
}

export async function getPaymentProviderStatus(): Promise<PaymentProviderStatus> {
  return apiRequest<PaymentProviderStatus>('/api/payments/provider')
}

export async function updateGroupPlan(
  groupId: string,
  action: 'assign' | 'trial' | 'schedule' | 'apply' | 'read_only',
  planId?: string,
): Promise<void> {
  await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/plan`, {
    method: 'PUT',
    body: { action, planId },
  })
}

export async function startGroupCheckout(groupId: string, planId: string, interval = 'month', extraGroups = 0, operationId = crypto.randomUUID(), recurringConsent = false): Promise<string> {
  const result = await apiRequest<{ url: string }>(`/api/groups/${encodeURIComponent(groupId)}/billing/checkout`, {
    method: 'POST',
    body: {
      planId,
      interval,
      extraGroups,
      operationId,
      recurringConsent,
      successUrl: `${window.location.origin}/app/plans?checkout=success`,
      cancelUrl: `${window.location.origin}/app/plans?checkout=cancelled`,
    },
  })
  return result.url
}

export type BillingSelection = { planId: string; interval: 'month' | 'year'; extraGroups: number }
export type BillingSummary = {
  organizationId: string; canManage: boolean; planId: string; status: string; interval: string
  periodEndsAt: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean
  canCreate: boolean; legacyAccess: boolean; extraGroups: number; scheduledPlanId: string | null; groupIds: string[]
  hasSubscription: boolean; canStartTrial: boolean; temporaryAccessEndsAt: string | null
}
export const getBillingOrganizations = () => apiRequest<BillingSummary[]>('/api/billing/organizations')
export const startAccountTrial = (planId: string) => apiRequest<BillingSummary>(
  '/api/billing/organizations/trial', { method: 'POST', body: { planId } })
export type BillingQuote = { amountDue: number; currency: string; quoteId: string }
export type BillingHistoryEntry = {
  id: string
  invoiceId: string | null
  status: string
  amountMinor: number
  currency: string
  eventAt: string
  periodStart: string | null
  periodEnd: string | null
}
export type BillingPaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number }
export type PaymentMethodSetup = { clientSecret: string; publishableKey: string }
export const getBillingPaymentMethod = (id: string) => apiRequest<BillingPaymentMethod | null>(`${billingPath(id)}/payment-method`)
export const createBillingPaymentMethodSetup = (id: string) => apiRequest<PaymentMethodSetup>(`${billingPath(id)}/payment-method/setup`, {
  method: 'POST', body: { operationId: crypto.randomUUID() },
})
export const confirmBillingPaymentMethod = (id: string, setupIntentId: string, operationId: string) =>
  apiRequest<BillingPaymentMethod>(`${billingPath(id)}/payment-method/confirm`, {
    method: 'POST', body: { setupIntentId, operationId },
  })
export const getBillingHistory = (organizationId: string) => apiRequest<BillingHistoryEntry[]>(
  `/api/billing/organizations/${encodeURIComponent(organizationId)}/history`)
export type BillingReferralSummary = {
  referralCode: string
  attributedToCode: string | null
  referredOrganizations: number
  rewardedDays: number
  pendingDays: number
}
const billingPath = (id: string) => `/api/groups/${encodeURIComponent(id)}/billing`
export const getBilling = (id: string) => apiRequest<BillingSummary>(billingPath(id))
export const startTrial = (id: string, planId: string) => apiRequest<void>(`${billingPath(id)}/trial`, { method: 'POST', body: { planId } })
export const previewBillingChange = (id: string, selection: BillingSelection) => apiRequest<BillingQuote>(`${billingPath(id)}/preview`, { method: 'POST', body: selection })
export const changeBilling = (id: string, selection: BillingSelection, quoteId: string, operationId: string, recurringConsent = false) => apiRequest<void>(`${billingPath(id)}/change`, { method: 'POST', body: { selection, quoteId, operationId, recurringConsent } })
export const cancelBilling = (id: string, cancel: boolean, operationId: string) => apiRequest<void>(`${billingPath(id)}/cancellation`, { method: 'POST', body: { cancel, operationId } })
export const linkBillingGroup = (id: string, targetId: string, link: boolean) => apiRequest<void>(`${billingPath(id)}/groups/${encodeURIComponent(targetId)}`, { method: link ? 'PUT' : 'DELETE' })
export const getBillingReferral = (organizationId: string) => apiRequest<BillingReferralSummary>(
  `/api/billing/organizations/${encodeURIComponent(organizationId)}/referral-code`, { method: 'POST', body: {} })
export const applyBillingReferral = (organizationId: string, code: string) => apiRequest<BillingReferralSummary>(
  `/api/billing/organizations/${encodeURIComponent(organizationId)}/referrals/attribute`, { method: 'POST', body: { code } })
