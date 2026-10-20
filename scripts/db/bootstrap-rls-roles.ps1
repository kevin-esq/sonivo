$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
$sqlPath = Join-Path $PSScriptRoot 'bootstrap-rls-roles.sql'
$composeFile = Join-Path $repoRoot 'compose.yaml'
Get-Content -LiteralPath $sqlPath -Raw |
    docker compose -f $composeFile exec -T postgres `
        psql -U sonivo -d sonivo_dev -v ON_ERROR_STOP=1 -f -
if ($LASTEXITCODE -ne 0) {
    throw 'Could not provision the constrained local application role.'
}
