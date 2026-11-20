import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const apiClientUrl = new URL('../../../packages/api-client/src/client.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === '@sonivo/api-client/client' ? apiClientUrl : specifier, context)
  },
})

const { ApiError, apiRequest } = await import(apiClientUrl)
const { problemDetail } = await import('../src/api/http.ts')

test('apiRequest exposes stable code and support id on ApiError', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'rate_limited',
    supportId: 'body-support-id',
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/problem+json',
      'X-Support-Id': 'header-support-id',
    },
  })

  try {
    await assert.rejects(apiRequest('/api/test'), (error) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.code, 'rate_limited')
      assert.equal(error.supportId, 'body-support-id')
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('billing problem relies only on stable code', () => {
  const translate = (key) => key

  assert.equal(
    problemDetail(new ApiError('Request failed: 409', 409, {
      code: 'billing_active_plan_required',
      detail: 'A generic API detail',
    }), translate),
    'billing.activePlanRequired',
  )
  assert.equal(
    problemDetail(new ApiError('Request failed: 409', 409, { detail: 'billing-active-plan-required' }), translate),
    'common.errorConflict',
  )
})
