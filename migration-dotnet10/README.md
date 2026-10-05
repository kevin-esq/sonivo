# migration-dotnet10 — Sandbox backend (.NET 10 / C# 14)

Capa de migración **aislada**. No sustituye ni modifica el backend .NET 9 actual
(`/src`, `/tests`); ese árbol es de solo lectura. Todo lo de esta carpeta está
pensado para integrarse más adelante o descartarse.

## Qué contiene

Un único proyecto Minimal API, `Sonivo.Migration.Api`, que expone el endpoint de
branding multi-tenant que el frontend (Next.js) consumiría para SSR de temas y
textos i18n:

```text
GET /api/v1/tenants/{slug}/branding?lang=es
GET /api/v1/tenants/{slug}/branding/logo
GET /health
```

`{slug}` es el subdominio del grupo (`slug.sonvo.lat`). La respuesta incluye:

- `branding`: colores (`primaryHex`, `secondaryHex`, `accentHex`, `successHex`,
  `warningHex`, `errorHex`), foregrounds AA (`onPrimary`, `onSecondary`,
  `onAccent`), `typography`, `themeDefault`, portada y `links` (logo/banner/favicon).
- `texts`: copy localizado (`welcome`, `loginHeadline`, `tagline`, `verse` y
  etiquetas de navegación), con overrides por tenant.
- `locale` + `supportedLocales` (`es` por defecto, más `en` y `pt`).

## Estructura

```text
migration-dotnet10/
  Directory.Build.props                 # aislado: NO hereda el de la raíz
  Sonivo.Migration.slnx
  src/Sonivo.Migration.Api/
    Program.cs                          # pipeline Minimal API
    Contracts/Branding/*                # DTOs de respuesta (inglés)
    Contracts/Serialization/ApiJsonContext.cs  # JSON source-gen
    Features/Branding/                  # vertical slice de branding
    Infrastructure/GlobalExceptionHandler.cs
    branding.http                       # peticiones de prueba (VS Code / Rider)
```

## Decisiones técnicas clave

| Tema | Implementación |
| --- | --- |
| C# 14 | `field` keyword en `BrandingCacheOptions`; **extension members** en `TenantBrandingExtensions`; collection expressions. |
| .NET 10 perf | `System.Text.Json` **source generation** (`ApiJsonContext`), `Results<>`/`TypedResults` tipados, `FrozenDictionary`/`FrozenSet` para lookups, `GeneratedRegex`/`GeneratedRegex` de slug y hex, `LoggerMessage` source-gen, **Output Caching** con evicción por tags, **Response Compression** por HTTPS, rate limiting por IP. |
| Contraste | `BrandingColorMath` replica el cálculo WCAG 2.1 que el frontend hacía en cliente; el servidor entrega `on*` ya resuelto. |
| i18n | `BrandingTextCatalog` negocia `?lang` → `Accept-Language` (q-values) → locale del tenant → `es`. |
| Aislamiento | `Directory.Build.props` propio evita heredar el baseline de la raíz; el store es en memoria (`InMemoryBrandingReader`) tras la interfaz `IBrandingReader`, reemplazable por EF Core. |

## Cómo ejecutar / verificar

```powershell
cd migration-dotnet10
dotnet build Sonivo.Migration.slnx
dotnet run --project src/Sonivo.Migration.Api
```

La API escucha en `http://localhost:5199` (perfil `http`). Ejemplos de llamadas
en `src/Sonivo.Migration.Api/branding.http`.

## Seams para la integración real

1. **`IBrandingReader`** → implementar con EF Core (`AsNoTracking`, query
   compilada, `AsSplitQuery` si crece) sobre las tablas de tenant/branding.
2. **Invalidación de caché** → al guardar branding, `IOutputCacheStore
   .EvictByTagAsync($"tenant:{slug}")`.
3. **AuthZ** → el endpoint es anónimo por diseño (pantalla de login marcada);
   el resto de la API migraría conservando cookie de Identity + antiforgery.
