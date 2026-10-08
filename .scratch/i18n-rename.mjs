import fs from 'node:fs'

const LOCALES = [
  'web/apps/app/src/i18n/locales/es.ts',
  'web/apps/app/src/i18n/locales/en.ts',
  'web/apps/app/src/i18n/locales/pt.ts',
]

const PREFIX_MAP = {
  canciones: 'songs',
  cancion: 'song',
  inicio: 'dashboard',
  gente: 'people',
  equipo: 'team',
  ajustes: 'settings',
  ajustesCuenta: 'accountSettings',
  agenda: 'schedule',
  arreglo: 'arrangement',
  evento: 'event',
  practica: 'practice',
  recursos: 'resources',
  tareas: 'tasks',
  calendario: 'calendar',
  grupos: 'groups',
  grupo: 'group',
  perfil: 'profile',
  cuenta: 'account',
  listas: 'setlists',
  lista: 'setlist',
  seguridad: 'security',
  tiempos: 'times',
  cola: 'queue',
  referencia: 'reference',
  membresia: 'membership',
  unirse: 'joinGroup',
}

const apply = process.argv.includes('--apply')

function readKeys(text) {
  return [...text.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1])
}

const SEGMENT_MAP = {
  ajustes: 'settings',
}

function mapKey(key) {
  const dot = key.indexOf('.')
  if (dot < 0) return key
  const prefix = key.slice(0, dot)
  const mapped = PREFIX_MAP[prefix]
  const head = mapped ? mapped : prefix
  const tail = key
    .slice(dot + 1)
    .split('.')
    .map((seg) => SEGMENT_MAP[seg] ?? seg)
    .join('.')
  return `${head}.${tail}`
}

const esText = fs.readFileSync(LOCALES[0], 'utf8')
const keys = readKeys(esText)
const mapping = new Map(keys.map((k) => [k, mapKey(k)]))

const unmapped = [...new Set(keys.filter((k) => k !== mapKey(k) ? false : false))]

// Report prefixes that are not mapped (so the map can be completed).
const prefixes = [...new Set(keys.filter((k) => k.includes('.')).map((k) => k.split('.')[0]))]
const missingPrefixes = prefixes.filter((p) => !PREFIX_MAP[p])
console.log('prefixes:', prefixes.sort().join(', '))
console.log('unmapped prefixes:', missingPrefixes.join(', ') || '(none)')

// Detect collisions among the new keys.
const newKeys = keys.map((k) => mapKey(k))
const seen = new Map()
const collisions = []
for (const k of newKeys) {
  seen.set(k, (seen.get(k) ?? 0) + 1)
}
for (const [k, n] of seen) if (n > 1) collisions.push(k)
console.log('collisions:', collisions.join(', ') || '(none)')

// Report second-level segments that look Spanish, so suffixes can be mapped too.
const SPANISH_SUFFIX = /\b(hola|titulo|nombre|guardar|crear|nuevo|nueva|fecha|hora|sin|con|para|cargando|cargar|agregar|quitar|editar|borrar|eliminar|cerrar|volver|siguiente|anterior|buscar|enviar|correo|mensaje|grupo|grupos|cancion|canciones|lista|listas|inicio|ajustes|cuenta|tareas|evento|eventos|arreglo|recursos|miembro|miembros|usuario|clave|contrasena|nombre)\b/i
const spanishSuffixes = [...new Set(
  keys
    .filter((k) => k.includes('.'))
    .map((k) => k.split('.').slice(1).join('.'))
    .filter((suffix) => SPANISH_SUFFIX.test(suffix)),
)]
console.log('spanish-looking suffixes:', spanishSuffixes.length)
if (spanishSuffixes.length) console.log(spanishSuffixes.join('\n'))

const changed = keys.filter((k) => k !== mapKey(k))
console.log('keys to rename:', changed.length, '/', keys.length)

if (!apply) {
  console.log('DRY RUN — pass --apply to write changes')
  process.exit(0)
}

if (collisions.length) {
  console.error('refusing to apply with collisions')
  process.exit(1)
}

// 1) Rewrite the quoted key labels inside the locale files.
for (const file of LOCALES) {
  let text = fs.readFileSync(file, 'utf8')
  text = text.replace(/^(\s*)"([^"]+)":/gm, (m, indent, key) => {
    const next = mapping.get(key) ?? key
    return `${indent}"${next}":`
  })
  fs.writeFileSync(file, text)
}

// 2) Replace every t('key') / 'key' reference across the app source.
const SRC = 'web/apps/app/src'
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(p)
  }
}
walk(SRC)

let replacedFiles = 0
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  const original = text
  for (const [oldKey, newKey] of mapping) {
    if (oldKey === newKey) continue
    text = text.split(`'${oldKey}'`).join(`'${newKey}'`)
    text = text.split(`"${oldKey}"`).join(`"${newKey}"`)
  }
  // Dynamic/template-literal prefixes, e.g. t(`ajustes.palette${id}`).
  for (const [oldPrefix, newPrefix] of Object.entries(PREFIX_MAP)) {
    text = text.split('`' + oldPrefix + '.').join('`' + newPrefix + '.')
  }
  if (text !== original) {
    fs.writeFileSync(file, text)
    replacedFiles += 1
  }
}
console.log('source files updated:', replacedFiles)
