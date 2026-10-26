import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const exportRoot = resolve(repositoryRoot, 'web/apps/app/out')
const port = Number(process.argv[2] ?? 5173)
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname.startsWith('/api/')) {
    response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' })
    response.end('{"detail":"API unavailable in static route smoke test"}')
    return
  }

  let filePath = resolve(exportRoot, `.${decodeURIComponent(pathname)}`)
  if (!filePath.startsWith(`${exportRoot}${sep}`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = resolve(exportRoot, 'index.html')
  }

  response.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
}).listen(port, '127.0.0.1')
