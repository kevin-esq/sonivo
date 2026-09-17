# Production image: React SPA + ASP.NET API, same origin (ADR-0011).
# Render sets PORT; Program.cs binds to it.

FROM node:20-bookworm-slim AS web
WORKDIR /web
COPY web/sonivo-web/package.json web/sonivo-web/package-lock.json ./
RUN npm ci
COPY web/sonivo-web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY src/Sonivo.Domain/Sonivo.Domain.csproj src/Sonivo.Domain/
COPY src/Sonivo.Application/Sonivo.Application.csproj src/Sonivo.Application/
COPY src/Sonivo.Infrastructure/Sonivo.Infrastructure.csproj src/Sonivo.Infrastructure/
COPY src/Sonivo.Api/Sonivo.Api.csproj src/Sonivo.Api/
RUN dotnet restore src/Sonivo.Api/Sonivo.Api.csproj
COPY src/ src/
RUN dotnet publish src/Sonivo.Api/Sonivo.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
COPY --from=web /web/dist ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "Sonivo.Api.dll"]
