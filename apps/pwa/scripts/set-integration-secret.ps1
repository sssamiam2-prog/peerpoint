# Set PEERPOINT_INTEGRATION_SECRET on Cloudflare Pages (peer-support-pwa).
# Used by Power Automate to call GET/POST /api/integrations/peer-support-events
#
# Usage (from apps/pwa):
#   .\scripts\set-integration-secret.ps1
# Or:
#   $env:PEERPOINT_INTEGRATION_SECRET = 'your-long-random-string'
#   .\scripts\set-integration-secret.ps1 -NonInteractive

param(
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$tokenFile = Join-Path $repoRoot 'CloudflareToken.txt'
$accountFile = Join-Path $repoRoot 'CloudflareAccountId.txt'

if (-not $env:CLOUDFLARE_API_TOKEN -and (Test-Path $tokenFile)) {
  $env:CLOUDFLARE_API_TOKEN = (Get-Content -Raw $tokenFile).Trim()
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID -and (Test-Path $accountFile)) {
  $env:CLOUDFLARE_ACCOUNT_ID = (Get-Content -Raw $accountFile).Trim()
}

if (-not $env:CLOUDFLARE_API_TOKEN -or -not $env:CLOUDFLARE_ACCOUNT_ID) {
  Write-Host 'Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID.' -ForegroundColor Yellow
  exit 1
}

$secret = $env:PEERPOINT_INTEGRATION_SECRET
if (-not $secret) {
  if ($NonInteractive) {
    Write-Host 'Set PEERPOINT_INTEGRATION_SECRET or run interactively.' -ForegroundColor Yellow
    exit 1
  }
  $secret = -join ((48..57 + 65..90 + 97..122 | Get-Random -Count 48 | ForEach-Object { [char]$_ }))
  Write-Host 'Generated a new random secret (save it for Power Automate Bearer auth).' -ForegroundColor Cyan
}

$project = 'peer-support-pwa'
$secret | npx wrangler pages secret put PEERPOINT_INTEGRATION_SECRET --project-name=$project
Write-Host 'Done. Redeploy Pages (npm run deploy:pages) so Functions pick up new secrets if needed.' -ForegroundColor Green
Write-Host 'Verify: npx wrangler pages secret list --project-name=peer-support-pwa' -ForegroundColor DarkGray
