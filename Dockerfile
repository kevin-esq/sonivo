# Production image: React SPA + ASP.NET API, same origin (ADR-0011).
# Render sets PORT; Program.cs binds to it.

FROM node:22-bookworm-slim AS web
WORKDIR /web
# Workspace manifests first so dependency install is cacheable.
COPY web/package.json web/package-lock.json ./
COPY web/apps/app/package.json apps/app/
COPY web/apps/docs/package.json apps/docs/
COPY web/apps/mobile/package.json apps/mobile/
COPY web/packages/api-client/package.json packages/api-client/
COPY web/packages/i18n/package.json packages/i18n/
COPY web/packages/ui/package.json packages/ui/
RUN npm ci
COPY web/ ./
# Static export of the product app; the .NET host serves it from wwwroot.
ENV NEXT_EXPORT=1
RUN npm run build --workspace @sonivo/app

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Sonivo.Domain/Sonivo.Domain.csproj src/Sonivo.Domain/
COPY src/Sonivo.Application/Sonivo.Application.csproj src/Sonivo.Application/
COPY src/Sonivo.Infrastructure/Sonivo.Infrastructure.csproj src/Sonivo.Infrastructure/
COPY src/Sonivo.Api/Sonivo.Api.csproj src/Sonivo.Api/
RUN dotnet restore src/Sonivo.Api/Sonivo.Api.csproj
COPY src/ src/
RUN dotnet publish src/Sonivo.Api/Sonivo.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=web /web/apps/app/out ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# L3 (SECURITY-AUDIT-2026-09): run as the non-root `app` user (UID 1654) that
# the aspnet:10.0 image ships, instead of root.
USER app
ENTRYPOINT ["dotnet", "Sonivo.Api.dll"]
