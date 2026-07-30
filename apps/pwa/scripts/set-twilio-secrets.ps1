# Set Twilio Programmable Messaging secrets on Cloudflare Pages (peer-support-pwa).
# Never commit Account SID / Auth Token / From number to git.
#
# Prereq: same CloudflareToken.txt / CloudflareAccountId.txt (or env vars) as deploy-pages.ps1
# Twilio.org: Account SID, Auth Token, and a US From number in E.164 (+1…).
#
# Usage (from apps/pwa):
#   .\scripts\set-twilio-secrets.ps1
# Or non-interactive:
#   $env:TWILIO_ACCOUNT_SID = 'ACxxxx'
#   $env:TWILIO_AUTH_TOKEN = '...'
#   $env:TWILIO_FROM_NUMBER = '+18015551234'
#   .\scripts\set-twilio-secrets.ps1 -NonInteractive

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
  Write-Host 'Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (see deploy-pages.ps1).' -ForegroundColor Yellow
  exit 1
}

function Read-Secret([string]$name, [string]$envName) {
  $existing = [Environment]::GetEnvironmentVariable($envName)
  if ($NonInteractive) {
    if (-not $existing) {
      throw "Missing env $envName for -NonInteractive"
    }
    return $existing.Trim()
  }
  if ($existing) {
    $use = Read-Host "$name is set in the environment. Press Enter to use it, or type a new value"
    if (-not $use) { return $existing.Trim() }
    return $use.Trim()
  }
  $val = Read-Host $name
  return $val.Trim()
}

$sid = Read-Secret 'TWILIO_ACCOUNT_SID' 'TWILIO_ACCOUNT_SID'
$token = Read-Secret 'TWILIO_AUTH_TOKEN' 'TWILIO_AUTH_TOKEN'
$from = Read-Secret 'TWILIO_FROM_NUMBER (E.164 e.g. +18015551234)' 'TWILIO_FROM_NUMBER'

if (-not $sid -or -not $token -or -not $from) {
  Write-Host 'All three values are required.' -ForegroundColor Yellow
  exit 1
}
if ($from -notmatch '^\+[1-9]\d{7,14}$') {
  Write-Host 'TWILIO_FROM_NUMBER should look like +18015551234 (E.164).' -ForegroundColor Yellow
  exit 1
}

$project = 'peer-support-pwa'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $sid | npx wrangler pages secret put TWILIO_ACCOUNT_SID --project-name=$project
  $token | npx wrangler pages secret put TWILIO_AUTH_TOKEN --project-name=$project
  $from | npx wrangler pages secret put TWILIO_FROM_NUMBER --project-name=$project
  Write-Host ''
  Write-Host 'Done. Verify with: npx wrangler pages secret list --project-name=peer-support-pwa' -ForegroundColor Green
  Write-Host 'Then in Admin → Test App Functions → SMS, send a test text.' -ForegroundColor Green
} finally {
  Pop-Location
}
