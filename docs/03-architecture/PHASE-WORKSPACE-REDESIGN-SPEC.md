# Phase — Group workspace redesign (reference mockup)

**Status:** **CLOSED** — ADR-0055 ACCEPTED (user-authorized 2026-10-02, full scope W-A…W-H incl. Tasks + presence).
**Progress:** W-A…W-H all shipped and merged to `develop` (PRs #186, #187, #188, #189, #190, #191, #192).
**Baseline:** the code, not the docs.

> Claim labels: **HECHO** verified · **SUPUESTO** assumed · **PREGUNTA** open.

---

## 1. Goal

Bring the group workspace to visual and structural parity with the approved reference mockup: a grouped
sidebar, an immersive home (hero + quick tiles + next events + recently added songs), and per-section
screens (Canciones, Calendario, Recursos/Archivos, Miembros/Roles, Tareas, Song detail). Extends White
Label (ADR-0048/0054): the group's brand tokens still drive the surface.

## 2. Information architecture

```text
Inicio
Música: Canciones · Listas
Organización: Calendario · Eventos · Tareas
Equipo: Miembros · Roles
Recursos
Configuración
```

- **Canciones** = the song repertoire (current Biblioteca content, reworked). The page is
  titled **Canciones**; "Biblioteca" is no longer a separate nav item (owner addendum 2026-10-03).
- **Recursos** = the group material library (aggregated Resources), a cross-cutting top-level
  section. **Archivos** is no longer a section: files are attachments on their
  song/event/resource, and `/groups/:id/archivos` redirects to `/groups/:id/recursos`.
- **Roles** = the Members screen filtered by role (ADR-0051 roles already exist).
- **Tareas** = new feature (ADR-0055).

## 3. Data model (additive)

```text
GroupBranding   (+) Tagline varchar(160) NULL, Verse varchar(200) NULL
Song            (+) Tags varchar(?) — normalized tags (list), case-insensitive unique per group
SongFavorite    (new) Id, GroupId, SongId, UserId, CreatedAt — UNIQUE (SongId, UserId)
Task            (new) Id, GroupId, Title, Notes?, Status(open|done), DueAt?, AssigneeUserId?,
                      CreatedByUserId, CreatedAt, UpdatedAt, DeletedAt?, Version
ApplicationUser (+) LastSeenAt timestamptz NULL  — presence heartbeat (throttled)
```

Resources remain on arrangements; the group library aggregates them. Presence is best-effort and never
authorizes anything.

## 4. Waves and tickets

| Wave | Tickets | Content | Acceptance |
| --- | --- | --- | --- |
| **W-A** | T-WS-01…04 | Sectioned sidebar + group identity + top bar; hero (banner/tagline/verse/avatars/count); quick tiles; next events; recently added; promo card | Home matches the reference; AA light/dark; responsive |
| **W-B** | T-WS-05…06 | `Song.Tags` + favourites; Canciones page (tabs + table) | Tags persist; favourites per user; tabs filter |
| **W-C** | T-WS-07…08 | Group calendar route + Próximos eventos panel | Month/week/day; no cross-group leak |
| **W-D** | T-WS-09…10 | Group material library + categories + upload modal | Owner/Manager upload; isolation 404 |
| **W-E** | T-WS-11…12 | Presence + Members redesign (role tabs, instrument) | Presence best-effort; role filter |
| **W-F** | T-WS-13 | Song detail tabs + Información + related files | Tabs work; links authorized |
| **W-G** | T-WS-14…15 | `Task` entity + API + UI | CRUD + isolation + 403/404 |
| **W-H** | T-WS-16…18 | i18n/a11y, E2E + Playwright MCP, docs/checkpoint | Suite green; visual pass |

## 5. Out of scope

Subdomains/custom domains (ADR-0049), billing (ADR-0042), web JWT/BFF. New fonts are no
longer excluded for the group brand display face — see ADR-0070 (still no new provider).

## 6. Test plan

- Backend: domain + API for each additive field/entity; isolation (non-member → 404; role 403).
- Frontend: `npm run build` + `oxlint`.
- E2E: extend group/home/song journeys; new TC-WS-* per wave.
- Playwright MCP: light/dark, desktop/mobile, brand combinations.
