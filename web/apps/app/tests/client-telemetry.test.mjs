import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const apiClientUrl = new URL('../../../packages/api-client/src/client.ts', import.meta.url).href
const apiHttpUrl = new URL('../src/api/http.ts', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@sonivo/api-client/client') return nextResolve(apiClientUrl, context)
    if (specifier === '../api/http') return nextResolve(apiHttpUrl, context)
    return nextResolve(specifier, context)
  },
})

const { clearCsrfToken } = await import(apiHttpUrl)
const { reportClientError } = await import('../src/diagnostics/clientTelemetry.ts')

test('client error report omits URL and stack and truncates message', async () => {
  const originalFetch = globalThis.fetch
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const requests = []
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'test-agent' },
  })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    requests.push({ url, init })
    if (url === '/api/auth/csrf') {
      return new Response(JSON.stringify({ token: 'csrf-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(null, { status: 202 })
  }

  try {
    clearCsrfToken()
    reportClientError({
      source: 'window.error',
      message: 'x'.repeat(501),
      url: 'https://example.test/?token=private',
      stack: 'private stack',
    })
    await new Promise((resolve) => setImmediate(resolve))

    const report = requests.find((request) => request.url === '/api/client-errors')
    assert.ok(report)
    const body = JSON.parse(report.init.body)
    assert.equal(body.source, 'window.error')
    assert.equal(body.message, 'x'.repeat(500))
    assert.equal(Object.hasOwn(body, 'url'), false)
    assert.equal(Object.hasOwn(body, 'stack'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    } else {
      delete globalThis.navigator
    }
    clearCsrfToken()
  }
})
