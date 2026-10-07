---
name: frontend-architecture
description: Sonivo frontend structure and language rules. Use when adding, moving, splitting, or reviewing files under web/apps/app/src (or any Sonivo UI): where a component/hook/util belongs, when to split a page, how the API layer and i18n locales are organized, and the hard rule that code/back-end/routes stay English while only user-visible UI copy is localized (es/en/pt). Do not use for backend-only or non-UI work.
---

# Frontend Architecture (Sonivo)

Follow root `AGENTS.md`: it governs Git authority, scope, and delegation. This skill
describes **where code goes and in which language**; it never grants authority.

Vocabulary: use the `codebase-design` skill's terms (**module**, **interface**,
**seam**, **deep/shallow**, **adapter**). Prefer deep modules: a lot of behaviour
behind a small interface, placed at a clean seam.

---

## Hard rule: language (no Spanglish)

- **Code is English.** Identifiers, file names, folder names, types, comments,
  doc-comments, log/error messages, route paths, CSS ids, test names, and commit
  messages are **English**. No Spanish identifiers, no Spanish comments, no Spanish
  log strings.
- **Backend is English.** Domain/application/infrastructure code, validation
  messages, hub errors, exception text, and API route paths are English. The client
  maps codes/errors to localized UI copy — it never shows a raw backend string.
- **Routes are English** (`/groups/:id/library`, `/groups/:id/tasks`, …).
- **Only user-visible UI copy is localized** and it **must** go through `t()`.
  Never hardcode a user-visible string in JSX/TS — not even Spanish.
- Localized UI copy lives in the locale files (below), not in components.

Anti-patterns (reject in review):

```tsx
// ❌ Spanish literal in JSX (no i18n)
<button>Nueva lista</button>
// ❌ Spanish identifier/comment
const formulario = useFormulario() // arma el formulario
// ✅
<button>{t('agenda.createSetlist')}</button>
// ✅
const form = useForm() // builds the form
```

---

## Where code goes

```
src/
  i18n/
    index.tsx            # provider + useT/useLanguage + types only (small)
    keys.ts              # I18nKey (derived from the `es` locale)
    locales/es.ts en.ts pt.ts   # one file per language
  api/
    http.ts              # fetch + CSRF + error normalisation (single seam)
    <domain>.ts          # groups, songs, setlists, events, tasks, resources, people, billing, auth
    types.ts             # shared DTOs
  features/<feature>/    # repertoire, scheduling, tasks, settings, tenancy, shell, groups
    pages/<Page>.tsx     # orchestration: data + layout ONLY
    components/<X>.tsx   # one component per file
    hooks/use<Thing>.ts  # data/behaviour hooks
    lib/<util>.ts        # pure helpers for the feature
  ui/                    # account/panel primitives (Sonivo-fixed identity)
  groups/ui/ groups/dialogs/  # the group-scoped kit (ADR-0074)
  lib/                   # cross-cutting pure utilities
```

Rules:

1. **A page orchestrates, it does not implement.** It wires data (a hook) to layout
   (components). If a page file grows past ~200 lines or holds more than one
   component, split it.
2. **One component per file.** Nested sub-components of a page live in the feature's
   `components/` with their own file.
3. **Hooks separate the view from data.** A `use<Thing>` hook owns fetching, state,
   and real-time (`useGroupDataSignal`/`useGroupLive`); the component renders.
4. **One seam for HTTP.** All requests go through `api/http.ts`; domain files expose
   small, typed functions. Do not call `fetch` from components.
5. **Pure helpers in `lib/`.** Formatting/derivation with no React and no I/O.
6. **Deep modules over pass-throughs.** If a wrapper only forwards props, delete it
   (deletion test). If two modules differ only by a value, parameterise one.
7. **Group-scoped UI → `groups/ui`; account/panel UI → `ui/`.** Never mix (ADR-0074 §2).

## i18n rules

- Add a key once, in every locale (`es`, `en`, `pt`); `I18nKey` is generated from
  `es`, so a missing `en`/`pt` key fails the type-check.
- Use named placeholders (`"Hola, {name}"`), never concatenated Prefix/Suffix.
- Keys are English, namespaced by area (`agenda.*`, `groups.*`, `settings.*`).
- Default language is `es`; a user's explicit choice is persisted.

## When you touch a file

- If it is Spanish-commented or holds Spanish literals, fix them as part of the
  change (leave the area better than you found it).
- Keep the diff scoped; do not reformat unrelated code.
- Run `npx tsc --noEmit -p tsconfig.json` (Web) before handing off.
