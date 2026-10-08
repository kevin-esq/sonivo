# REMEDIATION-PLAN-DEVELOP-26df6f5.md

**Origen:** [`SECURITY-SWEEP-DEVELOP-26df6f5.md`](SECURITY-SWEEP-DEVELOP-26df6f5.md) · Repo `kevin-esq/sonivo` · `develop` @ `26df6f5`.
**Prioridad** = f(severidad × explotabilidad × exposición × impacto en tenancy).

---

## P0 — rompe tenancy o expone credenciales

**Ninguno.** El invariante de tenancy (`groupId` de cliente ≠ autorización) se cumple: no hay hallazgos que comprometan el aislamiento entre grupos ni que expongan credenciales/sesiones.

> No se crean tickets P0. Si en el futuro se habilita un despliegue multi-instancia, escalar **SWEEP-03/04** (ver P1) porque entonces el estado en memoria sí pasa a ser una brecha de correctitud de auth.

---

## P1 — hardening / correctitud relevante (Baja)

### SWEEP-01 · `sec(next): strip client-supplied tenant header on apex`
- **Archivos:** `web/sonivo-next/middleware.ts`.
- **Estrategia:** en la rama sin tenant, `requestHeaders.delete('x-tenant-slug')` antes del `NextResponse.next`; opcionalmente borrar cualquier `x-tenant-slug` entrante **antes** de setear el resuelto (evita contaminación en hosts de tenant).
- **Criterios de aceptación:**
  - Una petición a `sonvo.lat/` con `x-tenant-slug: X` renderiza el shell neutral (sin branding de X).
  - En `X.sonvo.lat`, el header entrante se ignora y prevalece el slug del host.
- **Prueba de verificación:** test unitario del `middleware` (host apex + header malicioso ⇒ header eliminado) o E2E Playwright con header modificado.
- **Dependencias:** ninguna. **Regresión:** baja (solo cabeceras internas). **Listo para PR:** sí.
- **tipo(scope):** `fix(next): ignore client-supplied tenant header on apex`

### SWEEP-02 · `chore(api): remove no-op DisableAntiforgery on google test hook`
- **Archivos:** `src/Sonivo.Api/Auth/GoogleAuthSetup.cs`.
- **Estrategia:** eliminar `.DisableAntiforgery()` (coherente con B3) **o** dejar comentario explícito de que es no-op frente al middleware global. Añadir un test que confirme que el hook dev sigue exigiendo `X-CSRF-TOKEN`.
- **Criterios de aceptación:** el endpoint dev sigue devolviendo 400 sin token CSRF; no hay rastro de API engañosa.
- **Prueba de verificación:** test de API (POST sin `X-CSRF-TOKEN` ⇒ 400) con el hook habilitado en Development.
- **Dependencias:** ninguna. **Regresión:** baja. **Listo para PR:** sí.
- **tipo(scope):** `chore(auth): drop no-op DisableAntiforgery from dev google callback`

### SWEEP-09 · `fix(realtime): re-authorize LeaveRoom membership`
- **Archivos:** `src/Sonivo.Api/Realtime/PracticeRoomHub.cs`.
- **Estrategia:** revalidar participante antes de remover de la sala (o documentar que la salida es puramente de presencia).
- **Criterios de aceptación:** usuario expulsado no puede conservar presencia tras un heartbeat/Leave.
- **Prueba de verificación:** test de hub. **Dependencias:** ninguna. **Regresión:** baja. **Listo para PR:** sí.
- **tipo(scope):** `fix(realtime): re-check membership on conductor room leave`

---

## P2 — informativos / decisiones de producto / deuda

### SWEEP-03 · `chore(auth): document or externalize passkey challenge store`
Decision + acción según apetito multi-instancia. Prueba: despliegue con 2 réplicas o test de `IDistributedCache`.
`tipo(scope): chore(auth): shared WebAuthn challenge store for multi-instance`

### SWEEP-04 · `chore(infra): shared rate-limit + session-handoff state`
Misma familia que SWEEP-03. `tipo(scope): chore(infra): distributed rate-limit and handoff state`

### SWEEP-05 · `docs(product): decide member email visibility`
Requiere ADR de producto (B15). `docs(product): member directory email visibility`

### SWEEP-06 · `feat(calendar): revocable per-group subscription token`
Producto (B12). `feat(calendar): revocable per-group ics subscription token`

### SWEEP-07 · `docs(security): align blob key scheme with design note`
Coherencia doc↔código. `docs(security): correct blob object-key scheme in SECURITY.md`

### SWEEP-08 · `chore(ef): refresh migration ProductVersion metadata`
Se resolverá al generar la próxima migración. `chore(ef): regenerate migration metadata header`

### SWEEP-10 · `docs(security): record WebAuthn attestation posture`
Documentado; decisión de endurecer. `docs(security): record attestation non-verification decision`

### SWEEP-11 · `fix(next): restrict tenant routes on apex`
Canonicalización. `fix(next): 404 tenant routes when served from apex`

---

## Orden de ejecución recomendado

1. **SWEEP-01** (middleware) — aislado y de mayor valor de hardening.
2. **SWEEP-02** (no-op CSRF) — limpieza de coherencia.
3. **SWEEP-09** (LeaveRoom) — pequeño.
4. P2 según decisión de producto/despliegue (03/04/05/06).

## Checklist de verificación post-fix

- [ ] `dotnet build Sonivo.slnx` verde (0 warnings).
- [ ] `dotnet test Sonivo.slnx` verde (incl. integración vs PostgreSQL).
- [ ] `npm run build` (web) verde.
- [ ] Semgrep sin nuevos hallazgos en los archivos tocados.
- [ ] `dotnet list package --vulnerable --include-transitive` + `npm audit` = 0.
- [ ] E2E Playwright de journeys de tenancy/CSRF en verde.
- [ ] CI (`ci.yml`, `codeql.yml`, `security.yml`) verde.

---

## Nota de alcance / límites de este plan

- P0 vacío **no** equivale a "sin riesgo": la auditoría fue **estática**; los PoC dinámicos (docker-sandbox) y Playwright **no** se ejecutaron (ver §2.4 del informe A). Recomendación: repetir con prueba dinámica cuando haya presupuesto/entorno.
- Priorizar cualquier hallazgo dinámico nuevo por encima de esta lista si aparece.
