import fs from 'node:fs'

const dir = 'web/apps/app/src/i18n'
const file = `${dir}/index.tsx`
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

// 1-based inclusive ranges discovered from the source.
const esBody = lines.slice(16, 1320) // lines 17..1320  (`const es = {` .. `} as const;`)
const enBody = lines.slice(1324, 2619) // lines 1325..2619
const ptBody = lines.slice(2620, 3851) // lines 2621..3851
const head = lines.slice(0, 16) // lines 1..16 (React imports + Language + LANGUAGES)
const tail = lines.slice(3852) // from `const dictionaries ...` onward

fs.mkdirSync(`${dir}/locales`, { recursive: true })

const esOut = esBody.join('\n').replace(/^const es = \{/, 'export const es = {')
fs.writeFileSync(`${dir}/locales/es.ts`, `${esOut}\n`)

const enOut = `import type { I18nKey } from '../keys'\n\n${enBody
  .join('\n')
  .replace(/^const en:/, 'export const en:')}`
fs.writeFileSync(`${dir}/locales/en.ts`, `${enOut}\n`)

const ptOut = `import type { I18nKey } from '../keys'\n\n${ptBody
  .join('\n')
  .replace(/^const pt:/, 'export const pt:')}`
fs.writeFileSync(`${dir}/locales/pt.ts`, `${ptOut}\n`)

fs.writeFileSync(
  `${dir}/keys.ts`,
  `import { es } from './locales/es'\n\nexport type I18nKey = keyof typeof es\n`,
)

const indexOut = `${head.join('\n')}
import { es } from './locales/es'
import { en } from './locales/en'
import { pt } from './locales/pt'
import type { I18nKey } from './keys'

${tail.join('\n')}
`
fs.writeFileSync(file, indexOut)

console.log('i18n split ok')
console.log('es keys block lines:', esBody.length)
console.log('en keys block lines:', enBody.length)
console.log('pt keys block lines:', ptBody.length)
