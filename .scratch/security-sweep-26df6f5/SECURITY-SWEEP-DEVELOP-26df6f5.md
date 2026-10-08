# SECURITY-SWEEP-DEVELOP-26df6f5.md

**Repo:** `kevin-esq/sonivo` · **Branch:** `develop` · **Commit objetivo:** `26df6f54b876aee50bfba4640b6692c61a9c1af3` (`26df6f5`, 2026-10-05).
**Método:** evidencia-primeiro, solo lectura, sin secretos, sin acciones de Git.
**Auditor:** Agente AppSec (OpenCode) · **Fecha de informe:** 2026-10-05.

> **Ancla verificada:** `git -C P:\repos\sonivo-sweep-26df6f5 rev-parse HEAD` → `26df6f54b876aee50bfba4640b6692c61a9c1af3`. Todo el análisis se realizó sobre un worktree **detached** en ese SHA. El SHA no cambió durante la auditoría.

---

## 1. Resumen ejecutivo

El backend aplica el modelo de tenancy **server-side** de forma consistente y correcta. **El invariante crítico se cumple: `groupId`/rol de cliente NUNCA autoriza.**

- **Veredicto del invariante de tenancy: `RESPETADO`.** Los 69 endpoints con `{groupId}` (más los recursos anidados) resuelven membresía/rol en el servidor vía `GroupAccessService` y cargan toda entidad por `(GroupId, Id)`. No se halló ningún IDOR cross-tenant confirmado.
- **Autorización de los 116 endpoints mapeada:** 92 `RequireAuthorization` + 19 anónimos intencionales + 6 en archivos satélite (Google OAuth, session handoff). Sin endpoints "sin decisión" de auth. El único `[Authorize]` de atributo está en el hub SignalR.
- **SCA:** `dotnet list package --vulnerable --include-transitive` → **0** entre 8 proyectos; `npm audit` (web + e2e) → **0**. Gates: `NuGetAudit` (`all`, NU1902/1903 como error), CodeQL, `security.yml`.
- **SAST (Semgrep 1.179.0):** 0 hallazgos sobre 18 archivos clave (backend auth/tenancy/session, frontend Next/Vite).
- **Auth/sesión/CSRF/WebAuthn/2FA:** correctos según ADR-0009/0011/0020 y el verificado de WebAuthn server-side; sin tokens en `localStorage`; CSRF global; cookies HttpOnly/Secure-prod/SameSite=Lax.
- **No se detectaron hallazgos Críticos/Altos nuevos** por análisis estático. Los residuales son **Bajos/Informativos**, mayormente de *hardening*, documentación o restricciones de despliegue ya conocidas.

**Limitaciones (ver §2.4):** no se ejecutaron PoC dinámicos (docker-sandbox) ni Playwright; `snyk` no autenticado; Semgrep sufrió un parseo parcial en `Program.cs`.

---

## 2. Alcance, SHA, metodología y limitaciones

### 2.1 Alcance
Estado completo de `develop` @ `26df6f5`. Inventario regenerado (coincide con lo declarado):

| Artefacto | Cantidad |
| --- | --- |
| Archivos `.cs` | 273 |
| Proyectos `.csproj` | 8 |
| Componentes `.tsx` / `.ts` | 99 / 97 |
| Migraciones/sql | 49 |
| `Map(Get\|Post\|Put\|Patch\|Delete)` | 116 |
| `[Authorize]` (atributo) | 1 (`Realtime/PracticeRoomHub.cs:23`) |
| `RequireAuthorization()` | 92 |
| `AllowAnonymous()` | 25 |
| `RequireRateLimiting()` | 31 |

### 2.2 Metodología (F1–F10)
- **F1 Reconocimiento:** inventario por `git ls-tree`/`git grep` en el SHA; mapa de autorización de endpoints por análisis de bloques de `Program.cs` + archivos satélite.
- **F2 SAST:** Semgrep MCP v1.179.0 (C#/TS) sobre 18 archivos críticos.
- **F3 SCA:** `dotnet list … --vulnerable --include-transitive`; `npm audit --json` (web, e2e).
- **F4 AuthZ/Tenancy (prioridad):** `GroupAccessService` + todos los handlers de `Application` + repositorios EF (`WHERE GroupId AND Id`).
- **F5 Auth/sesión:** cookies/antiforgery (Program.cs), OAuth (`OAuthNext`), handoff de sesión, passkeys/WebAuthn, 2FA, hub SignalR.
- **F6 Dinámico:** **NO ejecutado** (limitación; ver §2.4).
- **F7 Secretos:** `.env*` trackeados, patrones de claves en árbol, uso de env en frontend.
- **F8 Infra/CI-CD:** `permissions` de workflows, SCA gate, Dependabot (según ADR-0044).
- **F9 Validación cruzada:** lectura de contratos/DTOs y validación server-side (ver §5.11).
- **F10 Triage:** comparación con `SECURITY-AUDIT-2026-09/10`.

### 2.3 Herramientas usadas
`git` (read-only) · Semgrep MCP · `dotnet list package --vulnerable` · `npm audit` · lectura de código. MCP `github` disponible pero no requerido para hallazgos; `docker-sandbox`/`playwright` **no** usados.

### 2.4 Limitaciones (explícitas)
1. **Sin PoC dinámicos** (docker-sandbox/PostgreSQL desechable): no se reprodujeron ataques en un runtime real. Los hallazgos son estáticos.
2. **`snyk` sin autenticar:** no ejecutado; SCA cubierto por `NuGetAudit`/`dotnet list` + `npm audit`.
3. **Semgrep parseo parcial** en `Program.cs:5024` (`class Program;` no soportado por el parser C# de Semgrep) → la cola del archivo pudo no escanearse; suplido con lectura manual.
4. **`git log -p --all`** (historia de secretos) no ejecutado por coste; sí se escaneó el árbol y los `.env*` trackeados.
5. No se modificó la BD ni el estado del repo; contenedores: **0 creados** (no se usó sandbox).

---

## 3. Matriz de cobertura (OWASP Top 10 2021 + ASVS-lite)

| Superficie → | Backend API | AuthZ/Tenancy | EF/SQL | Identity/Cookies/CSRF | Passkeys/2FA | Frontend | Config/Secretos | Infra/CI-CD | Cadena suministro | Logging |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 Broken Access Control | Revisado | **Revisado (clave)** | Revisado | Revisado | Revisado | Revisado | N/A | N/A | N/A | Revisado |
| A02 Cryptographic Failures | Revisado | — | N/A | Revisado | Revisado | N/A | Revisado | N/A | N/A | Revisado |
| A03 Injection (SQL/LINQ/OS) | Revisado | — | Revisado | N/A | Revisado (CBOR) | Revisado | N/A | N/A | N/A | Revisado |
| A04 Insecure Design | Revisado | Revisado | N/A | Revisado | Revisado | Revisado | N/A | N/A | N/A | N/A |
| A05 Security Misconfiguration | Revisado | — | N/A | Revisado | Revisado | Revisado | Revisado | Revisado | N/A | Revisado |
| A06 Vulnerable Components | — | — | N/A | N/A | N/A | N/A | N/A | N/A | **Revisado (0 vulns)** | N/A |
| A07 AuthN Failures | Revisado | — | N/A | Revisado | Revisado | Revisado | N/A | N/A | N/A | Revisado |
| A08 Data Integrity Failures | Revisado | — | Revisado | Revisado | Revisado | Revisado | N/A | Revisado | Revisado | N/A |
| A09 Logging/Monitoring | Revisado | Revisado | N/A | Revisado | Revisado | N/A | N/A | N/A | N/A | **Revisado** |
| A10 SSRF | Revisado | — | N/A | N/A | N/A | Revisado | N/A | N/A | N/A | N/A |

Sin celdas "sin revisar" relevantes. `N/A` = no aplica a esa superficie.

---

## 4. Tabla de hallazgos

| ID | Título | Sev. | CWE | OWASP | Ubicación | Evidencia | Impacto | Reproducción | Recomendación | Esfuerzo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SWEEP-01 | Header `x-tenant-slug` no saneado en apex | Baja | CWE-807/CWE-441 | A04 | `web/sonivo-next/middleware.ts:73-77`, `app/layout.tsx:22-29` | El middleware copia `request.headers` y solo *setea* `x-tenant-slug` si hay tenant; en apex no lo borra | Confusión de tenant para contenido **público** (branding); sin impacto de AuthZ | Enviar `x-tenant-slug: <otro>` a `sonvo.lat/` y observar branding ajeno/404 | `requestHeaders.delete('x-tenant-slug')` cuando `tenant === null` y siempre sobrescribir | S |
| SWEEP-02 | `.DisableAntiforgery()` residual (no-op) | Baja | CWE-352 | A05 | `src/Sonivo.Api/Auth/GoogleAuthSetup.cs:183` | El CSRF es un middleware global (Program.cs ~391); el `.DisableAntiforgery()` no lo desactiva | Código engañoso (falsa sensación de exención). Endpoint dev-only, doble-gated | Inspección: el flag dev + global middleware siguen aplicando CSRF | Eliminar la llamada (coherente con B3) o comentar el no-op | S |
| SWEEP-03 | Challenge store de passkeys en memoria | Info | CWE-362/CWE-613 | A04 | `src/Sonivo.Api/Auth/PasskeysAuth.cs:54-106` | `ConcurrentDictionary` estático, proceso-local | Multi-instancia: ceremonies fallan; ya **documentado** (B13) | Despliegue >1 réplica sin sticky/shared store | Mantener la restricción documentada o `IDistributedCache` | M |
| SWEEP-04 | Estado de rate-limit/handoff en memoria | Info | CWE-770 | A04 | `Program.cs` (limiter), `Session/InMemorySessionHandoffStore.cs` | Estado por instancia | Límites efectivos por-instancia; ya documentado | Multi-instancia | Aceptar single-instance o backplane compartido | M |
| SWEEP-05 | Visibilidad de email de miembros | Info | CWE-200 | A01 | `MembershipHandlers.cs:55-60` | Emails sintéticos `@managed.invalid` ocultos; emails reales visibles a **cualquier** miembro | Exposición de contacto entre miembros (producto) | Depende de ADR de producto | Decisión de producto (B15) | M |
| SWEEP-06 | `calendar.ics` sólo por cookie | Info | CWE-798? | A07 | `Program.cs:4355,4377` | Sin token de suscripción revocable | Suscripción externa requiere cookie | Producto | Decisión de producto (B12) | M |
| SWEEP-07 | Esquema de object key de blobs | Info | — | A01 | `ResourceHandlers.cs:185` (`resources/{id}`) | El diseño mencionaba prefijo `groups/{groupId}/`; el acceso está autorizado antes | Ninguno (acceso gated) | — | Coherencia doc↔código | S |
| SWEEP-08 | `ProductVersion` de migraciones en 9.0.x | Info | — | A08 | `src/Sonivo.Infrastructure/Persistence/Migrations/*.Designer.cs` | Anotación informativa de EF | Ninguno (metadata) | — | Regenerar en futuras migraciones | S |
| SWEEP-09 | `LeaveRoom` no re-autoriza | Baja | CWE-863 | A01 | `Realtime/PracticeRoomHub.cs:70-76` | Sólo remueve de la sala en memoria y emite presencia | Presencia residual benigna; `BroadcastPosition` sí re-verifica manager | — | Recheck opcional de participante | S |
| SWEEP-10 | Attestation WebAuthn no verificada | Info | CWE-345 | A04 | `PasskeysAuth.cs:243-249` | `fmt` aceptado, `attStmt` no verificado (conveyance `none`, documentado) | Riesgo de autenticador no atestado; integridad por challenge/origin/rpIdHash + assertion | — | Documentado; aceptar o switch a attestation | M |
| SWEEP-11 | `/ {tenant}/{locale}` servible desde apex | Info | — | A04 | `middleware.ts:66-92`, `app/[tenant]/[locale]/layout.tsx` | El apex puede renderizar rutas de tenant por path directo (contenido público) | Canonicalización/SEO; sin AuthZ | — | Bloquear/restringir rutas de tenant en apex | S |

Severidades: Crítica/Alta/Media/**Baja**/Info. **P0 (rompe tenancy/expone credenciales): ninguno.**

---

## 5. Detalle por hallazgo (evidencia y verificación)

### SWEEP-01 — `x-tenant-slug` no saneado en apex
- `web/sonivo-next/middleware.ts:73-77`: `const requestHeaders = new Headers(request.headers)` copia TODOS los headers entrantes; `requestHeaders.set('x-tenant-slug', tenant)` solo ocurre `if (tenant)`. En apex (`tenant === null`) un header `x-tenant-slug` enviado por el cliente **pasa tal cual**.
- `web/sonivo-next/app/layout.tsx:22-29`: `const tenant = requestHeaders.get('x-tenant-slug'); const branding = tenant ? await getPublicBranding(tenant) : null`.
- **Impacto real:** el endpoint de branding público es anónimo y devuelve datos no sensibles; por tanto es confusión de tenant/SEO, no fuga. **Estado: PROBABLE** (impacto bajo, requiere observación de runtime para confirmar renderizado).
- **PoC conceptual (no ejecutada):** `curl -H "x-tenant-slug: grace-community" https://sonvo.lat/` → posible render con branding de `grace-community`.
- **Fix:** `if (!tenant) { requestHeaders.delete('x-tenant-slug') }` y mantener el set incondicional cuando exista.

### SWEEP-02 — `.DisableAntiforgery()` residual
- `src/Sonivo.Api/Auth/GoogleAuthSetup.cs:182-183`: `.AllowAnonymous().DisableAntiforgery()`.
- El middleware global de CSRF (`Program.cs`, bloque ~391-416) valida POST/PUT/PATCH/DELETE y `B3` (SECURITY-AUDIT-2026-10) documentó que `DisableAntiforgery()` era **no-op** y se retiraron 61 llamadas. Esta quedó.
- Riesgo: nulo funcionalmente (el middleware sigue aplicando); es deuda de coherencia. **Estado: CONFIRMADO (código); impacto Bajo.**

### SWEEP-03 — Passkey challenge store en memoria
- `PasskeysAuth.cs:54-106`: `ConcurrentDictionary` estático; `CreateChallenge` (32B CSPRNG), `ConsumeChallenge` single-use + TTL 5 min + binding de `userId`. Correcto en single-instance; restricción multi-instancia ya documentada (B13). **CONFIRMADO como limitación de despliegue.**

### SWEEP-04 — Estado en memoria (rate limit / handoff)
- `Program.cs`: `AddRateLimiter` por-instancia. `Session/InMemorySessionHandoffStore.cs`. Misma clase que B13. **CONFIRMADO (deployment constraint).**

### SWEEP-05 — Emails de miembros
- `MembershipHandlers.cs:46-64`: `ListMembersHandler` expone `Email` real salvo `@managed.invalid` (B15). Cualquier **miembro** ve los correos de los demás. Decisión de producto pendiente. **CONFIRMADO.**

### SWEEP-06 — `calendar.ics`
- `Program.cs:4355` (GET `/api/groups/{groupId}/calendar.ics`) con `RequireAuthorization` (4377 `RequireMemberAsync`). Una suscripción externa (calendario) no puede usar cookie → requiere token revocable (B12, decisión de producto). **CONFIRMADO.**

### SWEEP-07 — Object key de blobs
- `ResourceHandlers.cs:185`: `var objectKey = $"resources/{resourceId:D}"`. El acceso se autoriza antes (`GetResourceContentHandler`), pero el diseño (`SECURITY.md §3`) mencionaba `groups/{groupId}/`. **Informativo.**

### SWEEP-08 — `ProductVersion` migraciones
- Ej.: `.../Migrations/20261003010325_AddBrandSecondaryAndBanner.Designer.cs:23` `.HasAnnotation("ProductVersion", "9.0.20")`. Metadata informativa de EF; no afecta runtime. **Informativo.**

### SWEEP-09 — `LeaveRoom` sin recheck
- `PracticeRoomHub.cs:70-76`: `LeaveRoom` no re-verifica membresía (solo `JoinRoom` y `BroadcastPosition` lo hacen). La acción es salir/decrementar presencia: benigno. **CONFIRMADO (Bajo).**

### SWEEP-10 — Attestation no verificada
- `PasskeysAuth.cs:243-275`: se acepta cualquier `fmt` y no se verifica `attStmt`; la integridad viene de challenge/origin/rpIdHash/UP/AT + verificación de firma de la assertion (`VerifyAssertion`). Documentado. **CONFIRMADO (Info).**

### SWEEP-11 — Rutas de tenant servidas desde apex
- `middleware.ts` no restringe el path `/{tenant}/{locale}` en el apex (solo reescribe hosts de tenant). El contenido es público. **PROBABLE (impacto de canonicalización).**

### 5.11 Verificación del invariante de tenancy (F4 — evidencia positiva)
- Helper único: `src/Sonivo.Application/Tenancy/GroupAccessService.cs` — `RequireMemberAsync` (membresía + grupo no borrado → **404**), `RequireOwnerAsync`/`RequireManagerAsync`/`RequireParticipantAsync` (→ **403**), con logging de denegación.
- **Cobertura:** todos los handlers de `Application` que operan por Group llaman al helper (28 archivos contienen `Require*Async`); los que no (utilidades como `LrcParser`, `IcsCalendar`, `WavAudio`, `RosterCsvParser`, `PathTenantResolver`) no deciden AuthZ.
- **Scoping EF:** `EfSongStore.cs:30`, `EfArrangementStore.cs:56/61`, `EfEventStore.cs:141/146`, `EfSetlistStore.cs:30/35`, `EfTaskStore.cs:33` cargan con `WHERE GroupId == groupId && Id == …`.
- **Recursos anidados:** `EfResourceStore.cs:52` usa `(arrangementId, resourceId)`; **todos** los handlers de recursos (`ResourceHandlers.cs:377,420,503,564`) primero `RequireMember/Manager(groupId)` y luego `_arrangements.GetByIdAsync(groupId, arrangementId)` → un `arrangementId` ajeno no pertenece al grupo → 404. Sin IDOR.
- **Setlist items / Event apply-setlist:** `SetlistHandlers.cs:302-310` y `EventHandlers.cs:575-590` validan cada `ArrangementId`/`SongId` con `groupId` y rechazan cross-group (`ValidationException`).
- **Membresía:** `RemoveMember`/`ChangeMemberRole` exigen **Owner** y protegen al último Owner; `SetMusicalRole` exige **Manager**; `LeaveGroup` exige **Member** y protege al último Owner (`MembershipHandlers.cs`).
- **SignalR:** `[Authorize]` en `PracticeRoomHub` + `ConductorRoomAuthorizer` resuelve el `groupId` **desde el `eventId`** (`IEventGroupResolver`), nunca desde el cliente; no-miembro → 404-equivalente.
- **Handoff de sesión:** `SessionHandoffEndpoints.cs:66,105` re-verifican membresía al emitir y al canjear; código 256-bit CSPRNG, single-use, TTL 90 s, almacenado como SHA-256, binding de User-Agent (`SessionHandoffService.cs`).

**Conclusión F4: `RESPETADO`.**

---

## 6. Falsos positivos descartados y comparación con auditorías previas

| Candidato | Veredicto | Razón |
| --- | --- | --- |
| Endpoints sin `[Authorize]` | **FALSO POSITIVO** | La auth es fluida (`RequireAuthorization()` 92×); no hay endpoint group-scoped sin decisión. |
| `IResourceStore.GetByIdAsync(arrangementId, resourceId)` sin groupId | **FALSO POSITIVO** | El Arrangement se carga scopeado por grupo antes; acceso gated. |
| `OAuthNext` open redirect | **FALSO POSITIVO** | Allowlist estricta `^/join/{token}$`; rechaza `//`, `://`, `\`. |
| `HandoffClient` `window.location.assign(redirect)` | **FALSO POSITIVO** | El API devuelve `redirect = "/"` fijo en redeem. |
| `google/test-callback` sin CSRF | **FALSO POSITIVO (CSRF)** | El middleware global de CSRF sí aplica; `.DisableAntiforgery()` es no-op (queda como SWEEP-02). |
| SPA almacena token de sesión en JS | **FALSO POSITIVO** | `localStorage`/`sessionStorage`/`document.cookie` = 0 en `web/**`; auth por cookie HttpOnly. |

**Comparación con SECURITY-AUDIT-2026-09 / 2026-10:** los hallazgos A1–A7, B1–B15, C1–C9 se verifican **remediados**. Residuales que **siguen abiertos tal cual** (documentados): C1/C2 (refactor `Program.cs`), C4 (i18n de errores), B12 (calendar token URL → SWEEP-06), B15 (visibilidad de email → SWEEP-05), B13 (challenge store single-instance → SWEEP-03). No se re-reportan como nuevos.

---

## 7. Apéndice — comandos y salidas (sin secretos)

```text
# Ancla
git -C P:\repos\sonivo-sweep-26df6f5 rev-parse HEAD
→ 26df6f54b876aee50bfba4640b6692c61a9c1af3

# Inventario (SHA)
git ls-tree -r --name-only 26df6f5 | grep -c '\.cs$'      → 273
git ls-tree -r --name-only 26df6f5 | grep -c '\.csproj$'  → 8
git ls-tree -r --name-only 26df6f5 | grep -c '\.tsx$'     → 99
git grep -hE 'Map(Get|Post|Put|Patch|Delete)\(' 26df6f5 -- '*.cs' | wc -l → 116
git grep -hE '\[Authorize' 26df6f5 -- '*.cs' | wc -l      → 1
git grep -h 'RequireAuthorization' 26df6f5 -- '*.cs' | wc -l → 92
git grep -h 'AllowAnonymous' 26df6f5 -- '*.cs' | wc -l   → 25

# SCA backend
dotnet list Sonivo.slnx package --vulnerable --include-transitive
→ "no vulnerable packages" (8/8 proyectos)

# SCA frontend
npm audit --json (web/sonivo-web, e2e)
→ {"total":0,...}

# Secretos (árbol)
git ls-tree -r --name-only 26df6f5 | grep -E '(^|/)\.env' → .env.example, web/sonivo-next/.env.example
git grep -cE 'BEGIN .*PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_|gho_|AIza|xox[baprs]-|sk_live_' 26df6f5 → (sin coincidencias)

# Frontend riesgos
git grep -lE 'dangerouslySetInnerHTML' 26df6f5 -- web/ → 0
git grep -hE '\.innerHTML[[:space:]]*=' 26df6f5 -- web/ → 0
git grep -hE '(^|[^A-Za-z0-9_])eval\(' 26df6f5 -- web/ → 0
git grep -hE 'new Function\(' 26df6f5 -- web/ → 0
git grep -hE 'localStorage' 26df6f5 -- web/ → 28 (solo preferencias de UI; sin tokens)
git grep -hoE '(import\.meta\.env|process\.env)\.[A-Za-z0-9_]+' 26df6f5 -- web/
→ process.env.API_ORIGIN, process.env.NEXT_PUBLIC_ROOT_DOMAIN

# SAST
semgrep 1.179.0 · 18 archivos (backend auth/tenancy/session + frontend) → 0 resultados
(advertencia: PartialParsing en Program.cs:5024 — `class Program;`)

# CI
.github/workflows/ci.yml       → permissions: contents: read, actions: write
.github/workflows/codeql.yml   → permissions: contents: read, security-events: write
.github/workflows/security.yml → permissions: contents: read
```

---

## 8. Cierre

- **Invariante de tenancy: `RESPETADO`.**
- **P0: 0 · Altos: 0 · Medios: 0 · Bajos: 2 (SWEEP-01, SWEEP-02) · Informativos: 9.**
- **Git:** commit/push/PR = **NO** · **Contenedores docker-sandbox creados/eliminados: 0/0** · **Bloqueo: `snyk` sin autenticar.**
- **Dinámico:** no ejecutado (limitación declarada).
