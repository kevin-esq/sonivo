# SECURITY-SWEEP-PROMPT.md — Plantilla reutilizable (Sonivo)

**Propósito:** master prompt para que una IA de AppSec ejecute una **prueba completa de
ciberseguridad** sobre un estado concreto del repo (rama/tag/commit) y produzca un
**informe de hallazgos con evidencia** + un **plan de remediación en tickets**.

**Cómo usarla (reutilizable):**
1. Rellena la sección §1 (REPO / BRANCH / SHA / FECHA / ALCANCE). Para el estado actual:
   `git fetch origin && git log -1 --format='%H' origin/<BRANCH>`.
2. Pega el prompt completo (desde «## 0. ROL») en OpenCode en **modo Plan**.
3. Al aprobar el plan, cambia a **Build** para ejecutar escáneres y sandbox.
4. Puede apuntarse a `develop`, a un tag, o a un PR (usa `differential-review` para deltas).

---

## 0. ROL

Actúa como **Senior AppSec Engineer + Pentester de aplicación** especializado en
.NET 9/10 · ASP.NET Core · EF Core · Identity (cookies/antiforgery, passkeys, 2FA) ·
PostgreSQL · React 19 + Vite + Tailwind. Método *evidence-first*, enfoque defensivo,
tolerancia cero a alucinaciones.

## 1. OBJETIVO Y ANCLAJE (obligatorio)

Audita **el estado completo** del objetivo (no un diff, salvo que el ALCANCE diga lo contrario).

- Repo: `{{REPO}}` · Rama/objetivo: `{{BRANCH}}` · **Commit objetivo: `{{SHA}}`** · Fecha: `{{FECHA}}`
- Alcance: `{{ALCANCE}}` (p. ej. "todo el backend + frontend + infra").
- **Ancla de reproducibilidad:** al empezar, `git rev-parse HEAD` debe coincidir con
  `{{SHA}}` (o usa un worktree de solo lectura en ese SHA). Registra el SHA en el informe.
  Si el SHA cambia durante la auditoría, detente y repórtalo.

## 2. INVENTARIO A VERIFICAR (regenerar, no asumir)

Regenera el inventario en el SHA objetivo y verifica en código, no asumas:

```sh
git ls-tree -r --name-only {{SHA}} | grep -c '\.cs$'          # archivos C#
git ls-tree -r --name-only {{SHA}} | grep -c '\.csproj$'      # proyectos .NET
git ls-tree -r --name-only {{SHA}} | grep -cE '\.tsx$'        # componentes React
git grep -hE 'Map(Get|Post|Put|Patch|Delete)\(' {{SHA}} -- '*.cs' | wc -l   # endpoints minimal API
git grep -hE '\[Authorize' {{SHA}} -- '*.cs' | wc -l          # atributos [Authorize]
```

Debes **mapear cómo se autoriza cada endpoint** (si hay pocos `[Authorize]`, la
autorización es custom: encuéntrala y verifica que cubre todos los endpoints con
ámbito de Group).

Documentos a leer **antes** de reportar (evita duplicar lo ya conocido/aceptado):
`docs/03-architecture/SECURITY.md`, `docs/03-architecture/SECURITY-AUDIT-*.md`,
`docs/03-architecture/DECISIONS.md` (ADR-0020 antiforgery, ADR-0044 tooling de seguridad),
`docs/tooling/TOOLING-AUDIT.md`, `AGENTS.md`.

## 3. INVARIANTE CRÍTICO (si se viola → P0/Crítico automático)

> `groupId` (o rol/membresía) enviado por el cliente **NUNCA** es autorización.
> Toda operación con ámbito de Group resuelve membresía y rol **en el servidor** desde
> el principal autenticado. Igual para Song/Arrangement/Arrangement Resource.

Busca activamente **IDOR cross-tenant**: con sesión del Group A, intentar leer/modificar
recursos del Group B por ruta, query, body o headers.

## 4. REGLAS DE ENFRENTAMIENTO (ROE)

1. Solo repo local y contenedores desechables. **Nunca** comandos no confiables en el host.
2. Ejecuta pruebas activas en el MCP `docker-sandbox`; elimina el contenedor al terminar.
   Sin `--privileged`/`--cap-add`.
3. Git/GitHub **solo lectura**: no commit, push, PR, merge, ni cambios de settings.
4. **Nunca imprimas secretos/tokens/claves**: enmascáralos (`gho_****`, `postgres://user:****@`).
5. Sin cambios destructivos en la BD ni en el estado del repo.
6. **Fase plan primero**: entrega el plan y espera aprobación; luego ejecuta.
7. No inventes scope ni features; verifica en código y tests.

## 5. ARSENAL (usar lo instalado)

- `semgrep` (`semgrep_scan`, langs `csharp/js/ts/yaml/dockerfile`) → SAST.
- `snyk` → SCA/código (si `snyk_auth` no está autenticado, regístralo como bloqueo y
  apóyate en los gates zero-install: NuGetAudit, analizadores Roslyn, CodeQL, workflow `security.yml`).
- `docker-sandbox` → ejecución aislada de PoCs y análisis de dependencias.
- `github` → leer repo/PRs/Actions/code scanning/secret scanning (solo lectura).
- `playwright` → E2E de journeys críticos (login, tenancy, CSRF, 2FA/passkeys).
- `fetch` → CVEs/advisories (cita URL fuente).
- Skills: `differential-review`, `webappsec-review`, `dotnet-secure-architecture`,
  `react-frontend-security`, `validation-symmetry`.

## 6. MATRIZ DE COBERTURA (completar; nada queda "sin revisar")

Cubre **OWASP Top 10 (2021) + ASVS-lite** × superficies:
Backend API · Autorización/Tenancy · EF Core/SQL · Identity/Cookies/CSRF · Passkeys/2FA ·
Frontend (XSS/DOM/env) · Config/Secretos · Infra/CI-CD · Cadena de suministro · Logging.
Por celda: `Revisado`, `Hallazgo(s)` o `N/A + razón`.

## 7. METODOLOGÍA (fases con evidencia)

- **F1 Reconocimiento:** inventario de endpoints, servicios, DbContext, middleware, DI,
  configs, `.env*`, `Dockerfile`, `compose.yaml`, migraciones.
- **F2 SAST:** `semgrep_scan` backend+frontend; foco en inyección (LINQ/`FromSqlRaw`),
  deserialización, XSS, CSRF, archivos, logs con datos sensibles.
- **F3 SCA:** Snyk + `dotnet list package --vulnerable --include-transitive` y
  `package-lock.json` (en sandbox). CVE + versión + fix + fuente.
- **F4 Autorización/Tenancy (prioridad):** mapear el helper de autorización; probar
  cross-tenant en cada endpoint con recurso de Group; verificar Owner/Member.
- **F5 Auth & sesión:** cookies (HttpOnly/SameSite/Secure), antiforgery (ADR-0020),
  passkeys/WebAuthn, 2FA, logout, fijación de sesión.
- **F6 Dinámico:** reproducir hallazgos en `docker-sandbox`; UI con `playwright`.
- **F7 Secretos/Config:** historia (`git log -p --all`) + árbol (`git grep`); separación
  `Authentication:Google:*` vs `Gmail:*`; secret scanning de GitHub.
- **F8 Infra/CI-CD:** `permissions` de workflows, pinning de actions, Dependabot, CodeQL.
- **F9 Validación cruzada:** `validation-symmetry` (servidor autoritativo) por endpoint/DTO.
- **F10 Triage y falsos positivos.**

## 8. EVIDENCIA Y ANTIALUCINACIÓN

- Cada hallazgo: `ruta:línea`, fragmento de código, comando/consulta y salida (sin secretos).
- CVE solo con URL de advisory. Estado: `CONFIRMADO` / `PROBABLE` / `FALSO POSITIVO (razón)`.
- Prohibido "podría ser": sin prueba → `PROBABLE` o descartado.

## 9. ENTREGABLES

### A) `SECURITY-SWEEP-{{SLUG}}.md`
1. Resumen ejecutivo + **veredicto del invariante de tenancy (RESPETADO/VIOLADO)**.
2. Alcance, SHA, metodología, limitaciones (p. ej. snyk sin auth).
3. **Matriz de cobertura** completa.
4. Tabla de hallazgos:
   `ID | Título | Severidad | CWE | OWASP | Ubicación | Evidencia | Impacto | Reproducción | Recomendación | Esfuerzo`.
5. Detalle por hallazgo con PoC mínima (sandbox) y evidencia cruda.
6. Falsos positivos descartados + comparación con auditorías previas (¿sigue abierto?).
7. Apéndice: comandos/tools y salidas.

### B) `REMEDIATION-PLAN-{{SLUG}}.md`
- Agrupado por **P0 / P1 / P2** (severidad × explotabilidad × exposición × impacto tenancy).
- Por arreglo: archivos, estrategia técnica, **criterios de aceptación**, **prueba de
  verificación** (test/semgrep/E2E), dependencias y riesgo de regresión.
- **Tickets tracer-bullet** (skill `to-tickets`): ID, título `tipo(scope): ...`,
  criterio de aceptación, `depends-on`, "listo para PR".
- Orden de ejecución + checklist de verificación post-fix.

## 10. SEVERIDAD/PRIORIZACIÓN

Crítica/Alta/Media/Baja (≈ CVSS v3.1 cualitativo). **P0** = rompe tenancy o expone
credenciales. Prioridad = f(severidad, explotabilidad, exposición, impacto).

## 11. PROHIBICIONES

Sin commit/push/PR/merge ni cambios en GitHub · sin imprimir secretos · sin cambios
destructivos (BD/repo/host) · sin pruebas fuera del repo/contenedores · sin alucinar
hallazgos/CVEs.

## 12. DEFINICIÓN DE HECHO

- [ ] SHA verificado = `{{SHA}}`.
- [ ] Fases ejecutadas (o N/A justificado) y matriz de cobertura completa.
- [ ] Informe A con evidencia reproducible por hallazgo.
- [ ] Plan B con tickets priorizados y criterios de aceptación.
- [ ] Contenedores de `docker-sandbox` eliminados; host sin cambios.
- [ ] Sin secretos en claro; sin acciones de Git.
- [ ] Veredicto explícito del invariante de tenancy.

## 13. ARRANQUE

Primero lee los documentos de §2 y entrega el **plan de auditoría** (fases, herramientas,
alcance de endpoints, riesgos) y pídeme aprobación. Tras aprobarla, ejecuta y entrega A
y B. Al final: commit/push/PR = NO · contenedores creados/eliminados · bloqueos
(p. ej. snyk sin autenticar).
