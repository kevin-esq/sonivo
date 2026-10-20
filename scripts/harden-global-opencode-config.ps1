# Harden the USER-GLOBAL OpenCode config (Sonivo audit, 2026-10-14).
#
# Moves the plaintext INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET in
# ~/.config/opencode/opencode.json to an {env:...} reference, matching the repo's
# own config. Non-destructive: writes a timestamped backup first, rewrites only
# that one value, and validates the JSON before saving.
#
# After running, set the secret in your environment, then restart OpenCode:
#   [Environment]::SetEnvironmentVariable(
#     'INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET', '<rotated-value>', 'User')
#   opencode service restart
#
# ROTATE the previously-exposed secret in Infisical regardless: it lived in
# plaintext on disk.

[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $env:USERPROFILE '.config\opencode\opencode.json'),
    [switch] $WhatIfOnly
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ConfigPath)) {
    throw "Config not found: $ConfigPath"
}

$raw = Get-Content -LiteralPath $ConfigPath -Raw
$json = $raw | ConvertFrom-Json

$entry = $json.mcp.servers.'infisical-local'
if ($null -eq $entry) {
    Write-Host "No 'infisical-local' server in $ConfigPath — nothing to do."
    return
}

$current = $entry.environment.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET
if ($current -eq '{env:INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}') {
    Write-Host "Already using {env:...} — nothing to do."
    return
}

if ($WhatIfOnly) {
    Write-Host "Would replace the plaintext secret in 'infisical-local' with {env:...}."
    return
}

$backup = "$ConfigPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $ConfigPath -Destination $backup
Write-Host "Backup written: $backup"

$entry.environment.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET = '{env:INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}'

# ConvertTo-Json keeps unrelated values; -Depth guards nested objects.
$updated = $json | ConvertTo-Json -Depth 100
# Validate before writing.
$null = $updated | ConvertFrom-Json
Set-Content -LiteralPath $ConfigPath -Value $updated -Encoding utf8

Write-Host "Replaced plaintext secret with {env:...} in $ConfigPath"
Write-Host "Next: set the environment variable and run 'opencode service restart'."