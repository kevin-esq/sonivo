// SPIKE-4 — one-time code exchange between a central auth host and a tenant host.
// Loopback only: AUTH = localhost, TENANT = 127.0.0.1 (two distinct hosts, so
// host-only cookie semantics apply). No external hosts are ever contacted.
//
// Validates: state in a host-only cookie of the TARGET host compared at exchange
// (login-CSRF), single-use code, expiry, Referrer-Policy: no-referrer, host-only
// cookie scoping, and a clean final redirect with no parameters.
import http from 'node:http'
import crypto from 'node:crypto'

const AUTH_HOST = 'localhost'
const TENANT_HOST = '127.0.0.1'
const AUTH_PORT = 4801
const TENANT_PORT = 4802
const authBase = `http://${AUTH_HOST}:${AUTH_PORT}`
const tenantBase = `http://${TENANT_HOST}:${TENANT_PORT}`

// ---------- tiny cookie jar keyed by HOST (models host-only cookies) ----------
class Jar {
  constructor() { this.byHost = new Map() }
  absorb(host, headers) {
    const raw = headers['set-cookie']
    if (!raw) return
    const list = Array.isArray(raw) ? raw : [raw]
    const jar = this.byHost.get(host) ?? new Map()
    for (const cookie of list) {
      const [pair] = cookie.split(';')
      const [name, ...rest] = pair.split('=')
      jar.set(name.trim(), rest.join('=').trim())
    }
    this.byHost.set(host, jar)
  }
  header(host) {
    const jar = this.byHost.get(host)
    if (!jar || jar.size === 0) return undefined
    return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  get(host, name) { return this.byHost.get(host)?.get(name) }
  hosts() { return [...this.byHost.keys()] }
}

function request(url, jar, init = {}) {
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: init.method ?? 'GET',
        headers: {
          ...(jar.header(u.hostname) ? { Cookie: jar.header(u.hostname) } : {}),
          ...(init.headers ?? {}),
        },
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          jar.absorb(u.hostname, res.headers)
          resolve({ status: res.statusCode, headers: res.headers, body, location: res.headers.location })
        })
      },
    )
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

// ---------- state ----------
const CODES = new Map() // code -> { targetHost, state, nonce, sid, expiresAt, used }
const SESSIONS = new Set()

const codeTtlMs = 60_000
let forceExpired = false

function noStore(res, extra = {}) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v)
}

// ---------- AUTH host ----------
const auth = http.createServer((req, res) => {
  const u = new URL(req.url, authBase)

  if (u.pathname === '/auth/login') {
    const sid = crypto.randomUUID()
    SESSIONS.add(sid)
    const code = crypto.randomBytes(18).toString('base64url')
    CODES.set(code, {
      targetHost: u.searchParams.get('target'),
      state: u.searchParams.get('state'),
      nonce: u.searchParams.get('nonce'),
      sid,
      expiresAt: Date.now() + (forceExpired ? -1000 : codeTtlMs),
      used: false,
    })
    noStore(res, {
      // host-only session cookie for the AUTH host (no Domain attribute)
      'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
    })
    const target = u.searchParams.get('target')
    res.statusCode = 302
    res.setHeader('Location', `http://${target}/auth/exchange?code=${code}&state=${u.searchParams.get('state')}`)
    res.end()
    return
  }

  if (u.pathname === '/auth/redeem' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { code, targetHost, state } = JSON.parse(body || '{}')
      const record = CODES.get(code)
      if (!record) return json(res, 400, { error: 'unknown_code' })
      if (record.used) return json(res, 409, { error: 'already_used' })
      if (Date.now() > record.expiresAt) return json(res, 410, { error: 'expired' })
      if (record.targetHost !== targetHost) return json(res, 400, { error: 'host_mismatch' })
      if (record.state !== state) return json(res, 400, { error: 'state_mismatch' })
      record.used = true
      json(res, 200, { userId: 'u_1', sid: record.sid })
    })
    return
  }

  res.statusCode = 404
  res.end()
})

function json(res, status, payload) {
  noStore(res, { 'Content-Type': 'application/json' })
  res.statusCode = status
  res.end(JSON.stringify(payload))
}

// ---------- TENANT host ----------
const tenant = http.createServer((req, res) => {
  const u = new URL(req.url, tenantBase)

  if (u.pathname === '/auth/begin') {
    const state = crypto.randomBytes(12).toString('base64url')
    const nonce = crypto.randomBytes(12).toString('base64url')
    noStore(res, {
      // state kept in a HOST-ONLY cookie of the TARGET host
      'Set-Cookie': `t_state=${state}; Path=/; HttpOnly; SameSite=Lax`,
    })
    res.statusCode = 302
    res.setHeader(
      'Location',
      `${authBase}/auth/login?target=${TENANT_HOST}:${TENANT_PORT}&state=${state}&nonce=${nonce}`,
    )
    res.end()
    return
  }

  if (u.pathname === '/auth/exchange') {
    const code = u.searchParams.get('code')
    const stateParam = u.searchParams.get('state')
    const stateCookie = (req.headers.cookie ?? '').match(/t_state=([^;]+)/)?.[1]
    if (!stateCookie || stateCookie !== stateParam) {
      return json(res, 400, { error: 'csrf_state_mismatch' })
    }
    // server-to-server redemption; the browser never sees the result
    request(`${authBase}/auth/redeem`, new Jar(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, targetHost: `${TENANT_HOST}:${TENANT_PORT}`, state: stateParam }),
    }).then((r) => {
      if (r.status !== 200) return json(res, r.status, { error: `redeem_${r.status}`, detail: r.body })
      const sid = crypto.randomUUID()
      noStore(res, {
        // the tenant issues its OWN host-only session cookie
        'Set-Cookie': `t_sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
      })
      res.statusCode = 303
      res.setHeader('Location', `${tenantBase}/app`) // clean URL, no code/state
      res.end()
    })
    return
  }

  if (u.pathname === '/app') {
    const sid = (req.headers.cookie ?? '').match(/t_sid=([^;]+)/)?.[1]
    json(res, 200, { page: 'app', authenticated: Boolean(sid), forwardedCookie: req.headers.cookie ?? '' })
    return
  }

  res.statusCode = 404
  res.end()
})

// ---------- assertions ----------
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`)
}

async function run() {
  await new Promise((r) => auth.listen(AUTH_PORT, '127.0.0.1', r))
  await new Promise((r) => tenant.listen(TENANT_PORT, '127.0.0.1', r))

  // T1 — happy path
  const jar = new Jar()
  let res = await request(`${tenantBase}/auth/begin`, jar)
  check('T1a begin redirects to auth host', res.status === 302 && res.location.startsWith(authBase), res.location)
  res = await request(res.location, jar)
  check('T1b auth redirects back to tenant exchange', res.status === 302 && res.location.includes('/auth/exchange?code='), res.location)
  const exchangeUrl = res.location
  res = await request(exchangeUrl, jar)
  check('T1c exchange issues a session and 303 to a clean URL', res.status === 303 && res.location === `${tenantBase}/app`, `status=${res.status} loc=${res.location}`)
  check('T1d no code/state leaked in the final URL', !/code=|state=/.test(res.location ?? ''), res.location)
  res = await request(`${tenantBase}/app`, jar)
  check('T1e tenant session works after exchange', res.status === 200 && res.body.includes('"authenticated":true'))

  // T2 — single use
  const codeT2 = new URL(exchangeUrl).searchParams.get('code')
  const stateT2 = new URL(exchangeUrl).searchParams.get('state')
  const r2 = await request(`${authBase}/auth/redeem`, new Jar(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: codeT2, targetHost: `${TENANT_HOST}:${TENANT_PORT}`, state: stateT2 }),
  })
  check('T2 code cannot be redeemed twice', r2.status === 409, `${r2.status} ${r2.body}`)

  // T3 — expiry
  forceExpired = true
  const jar3 = new Jar()
  let r3 = await request(`${tenantBase}/auth/begin`, jar3)
  r3 = await request(r3.location, jar3)
  const expiredUrl = r3.location
  const r3b = await request(expiredUrl, jar3)
  check('T3 expired code is rejected', r3b.status === 410, `status=${r3b.status} body=${r3b.body}`)
  forceExpired = false

  // T4 — login CSRF: attacker's code injected into the victim's browser
  const attackerJar = new Jar()
  let a1 = await request(`${tenantBase}/auth/begin`, attackerJar)
  check('T4a attacker got a host-only t_state cookie', Boolean(attackerJar.get(TENANT_HOST, 't_state')))
  a1 = await request(a1.location, attackerJar) // attacker completes login, obtains code+state
  const attackerCode = new URL(a1.location).searchParams.get('code')
  const attackerState = new URL(a1.location).searchParams.get('state')
  const victimJar = new Jar()
  let v1 = await request(`${tenantBase}/auth/begin`, victimJar) // victim has their OWN t_state
  const victimState = victimJar.get(TENANT_HOST, 't_state')
  const csrf = await request(
    `${tenantBase}/auth/exchange?code=${attackerCode}&state=${attackerState}`,
    victimJar,
  )
  check(
    'T4b victim cannot exchange the attacker code (state mismatch)',
    csrf.status === 400 && csrf.body.includes('csrf_state_mismatch'),
    `${csrf.status} ${csrf.body}`,
  )
  check('T4c victim state differs from attacker state', victimState !== attackerState)

  // T5 — host-only scoping: tenant cookie must NOT be visible to the auth host
  const authSeesTenantCookie = jar.header(AUTH_HOST)?.includes('t_state') ?? false
  check('T5a auth host never receives the tenant state cookie', !authSeesTenantCookie, jar.header(AUTH_HOST) ?? '(none)')
  const tenantSeesAuthCookie = /(^|;\s*)sid=/.test(jar.header(TENANT_HOST) ?? '')
  check('T5b tenant host never receives the auth session cookie', !tenantSeesAuthCookie, jar.header(TENANT_HOST) ?? '(none)')

  // T6 — Referrer-Policy on code-bearing responses
  const refJar = new Jar()
  const t6a = await request(`${tenantBase}/auth/begin`, refJar)
  const t6b = await request(t6a.location, refJar)
  check('T6 Referrer-Policy: no-referrer on auth redirect', t6b.headers['referrer-policy'] === 'no-referrer', String(t6b.headers['referrer-policy']))
  check('T6b Referrer-Policy: no-referrer on tenant exchange', (await request(`http://${TENANT_HOST}:${TENANT_PORT}/app`, refJar)).headers['referrer-policy'] === 'no-referrer')

  auth.close()
  tenant.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('SPIKE-4 error:', err)
  process.exit(2)
})
