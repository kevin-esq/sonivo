// SPIKE-3 — WebAuthn relying-party id across local subdomains.
// Loopback only: a.example.test / b.example.test / c.other.test are mapped to
// 127.0.0.1 by a Chromium host-resolver rule. NO real host is contacted.
//
// Question: with rpId = the PARENT domain (example.test), is a credential created
// on a.example.test usable on b.example.test, and NOT usable on another domain?
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire('P:/repos/sonivo/e2e/package.json')
const { chromium } = require('playwright')

const PORTS = { a: 4901, b: 4902, c: 4903 }
// sonivolab.test resolves to 127.0.0.1 (loopback); parent registrable domain = sonivolab.test.
// `localhost` is a different registrable domain and plays the "other domain" role.
const HOSTS = { a: 'a.sonivolab.test', b: 'b.sonivolab.test', c: 'localhost' }

const PAGE = `<!doctype html><meta charset="utf-8"><title>spike3</title>
<script>
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/=+$/,'')
  .replace(/\\+/g,'-').replace(/\\//g,'_');
const bytes = (n) => crypto.getRandomValues(new Uint8Array(n));
window.__wa = {
  async create(rpId) {
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        rp: { id: rpId, name: 'Spike' },
        user: { id: bytes(16), name: 'spike@example.test', displayName: 'Spike' },
        challenge: bytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        timeout: 30000,
        authenticatorSelection: { userVerification: 'preferred' },
        attestation: 'none',
      }});
      return { ok: true, id: b64(cred.rawId) };
    } catch (e) { return { ok: false, name: e.name, message: e.message }; }
  },
  async get(rpId) {
    try {
      const assertion = await navigator.credentials.get({ publicKey: {
        rpId, challenge: bytes(32), timeout: 30000, userVerification: 'preferred',
      }});
      return { ok: true, id: b64(assertion.rawId) };
    } catch (e) { return { ok: false, name: e.name, message: e.message }; }
  },
};
</script>`

const servers = []
function startServer(host, port) {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<!-- ${host} -->${PAGE}`)
  })
  servers.push(server)
  return new Promise((r) => server.listen(port, '127.0.0.1', r))
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`)
}

async function run() {
  await Promise.all([
    startServer(HOSTS.a, PORTS.a),
    startServer(HOSTS.b, PORTS.b),
    startServer(HOSTS.c, PORTS.c),
  ])

  // Chrome only honours --unsafely-treat-insecure-origin-as-secure with a persistent
  // profile, and Playwright requires that profile via launchPersistentContext.
  const context = await chromium.launchPersistentContext(
    path.resolve('.scratch/spikes/.pwprofile'),
    {
      headless: true,
      args: [
        `--host-resolver-rules=MAP * 127.0.0.1`,
        `--unsafely-treat-insecure-origin-as-secure=http://${HOSTS.a}:${PORTS.a},http://${HOSTS.b}:${PORTS.b}`,
        `--ignore-certificate-errors`,
      ],
    },
  )
  const page = context.pages()[0] ?? (await context.newPage())

  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  const urlA = `http://${HOSTS.a}:${PORTS.a}/`
  const urlB = `http://${HOSTS.b}:${PORTS.b}/`
  const urlC = `http://${HOSTS.c}:${PORTS.c}/`

  // 1) create on A with the PARENT rpId
  const navA = await page.goto(urlA, { waitUntil: 'domcontentloaded' }).catch((e) => ({ error: String(e) }))
  console.log(`nav A -> ${page.url()} status=${navA?.status ?? 'n/a'} err=${navA?.error ?? 'none'}`)
  check('secure context on a.sonivolab.test', await page.evaluate(() => window.isSecureContext))
  const created = await page.evaluate((rp) => window.__wa.create(rp), 'sonivolab.test')
  check('credential created on a.sonivolab.test with rpId=sonivolab.test', created.ok, JSON.stringify(created))
  const credentialId = created.id

  // 2) assert on B with the SAME parent rpId
  await page.goto(urlB, { waitUntil: 'domcontentloaded' })
  check('secure context on b.sonivolab.test', await page.evaluate(() => window.isSecureContext))
  const onB = await page.evaluate((rp) => window.__wa.get(rp), 'sonivolab.test')
  check('credential USABLE on b.sonivolab.test (same parent rpId)', onB.ok && onB.id === credentialId, JSON.stringify(onB))

  // 3) assert on C (a different registrable domain) with its own rpId
  await page.goto(urlC, { waitUntil: 'domcontentloaded' })
  const onC = await page.evaluate((rp) => window.__wa.get(rp), 'localhost')
  check('credential NOT usable on localhost (different rpId)', !onC.ok, JSON.stringify(onC))

  // 4) a subdomain rpId does not match a credential bound to the parent
  await page.goto(urlB, { waitUntil: 'domcontentloaded' })
  const mismatch = await page.evaluate((rp) => window.__wa.get(rp), 'b.sonivolab.test')
  check('rpId=b.sonivolab.test does NOT match the parent-bound credential', !mismatch.ok, JSON.stringify(mismatch))

  const creds = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
  check('virtual authenticator holds exactly one credential', creds.credentials.length === 1, `count=${creds.credentials.length}`)

  await context.close()
  servers.forEach((s) => s.close())

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error('SPIKE-3 error:', err?.message ?? err)
  servers.forEach((s) => s.close())
  process.exit(2)
})
