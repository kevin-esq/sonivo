$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$composeFile = Join-Path $repoRoot 'compose.yaml'
$priorMigrationConnection = $env:SONIVO_MIGRATION_CONNECTION
try {
    # This helper is strictly local. Never let an inherited production/staging
    # migration connection turn a convenience command into a remote migration.
    $env:SONIVO_MIGRATION_CONNECTION =
        'Host=localhost;Port=5433;Database=sonivo_dev;Username=sonivo;Password=sonivo'

    Push-Location $repoRoot
    try {
        dotnet ef database update `
            --configuration Release `
            --project src/Sonivo.Infrastructure `
            --startup-project src/Sonivo.Api
        if ($LASTEXITCODE -ne 0) {
            throw 'EF Core migrations failed.'
        }

        Get-Content -LiteralPath (Join-Path $PSScriptRoot 'grant-runtime-privileges.sql') -Raw |
            docker compose -f $composeFile exec -T postgres `
                psql -U sonivo -d sonivo_dev -v ON_ERROR_STOP=1 -f -
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not apply reviewed runtime database privileges.'
        }

        Get-Content -LiteralPath (Join-Path $PSScriptRoot 'verify-runtime-principal.sql') -Raw |
            docker compose -f $composeFile exec -T postgres `
                psql -U sonivo_app -d sonivo_dev -v ON_ERROR_STOP=1 -f -
        if ($LASTEXITCODE -ne 0) {
            throw 'Runtime database principal verification failed.'
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    $env:SONIVO_MIGRATION_CONNECTION = $priorMigrationConnection
}
