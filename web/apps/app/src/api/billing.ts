import { apiRequest } from './http'

export type PaymentProviderStatus = {
  provider: 'manual' | 'sandbox'
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

export async function startGroupCheckout(groupId: string, planId: string): Promise<string> {
  const result = await apiRequest<{ url: string }>(`/api/groups/${encodeURIComponent(groupId)}/billing/checkout`, {
    method: 'POST',
    body: {
      planId,
      successUrl: `${window.location.origin}/app/plans?checkout=success`,
      cancelUrl: `${window.location.origin}/app/plans?checkout=cancelled`,
    },
  })
  return result.url
}
