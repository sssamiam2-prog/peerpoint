# Upload production build to Cloudflare Pages (no Git required).
#
# Prereq: API token with Account → Cloudflare Pages → Edit (and User → User Details → Read if /memberships errors).
# https://dash.cloudflare.com/profile/api-tokens
#
# Option A — text files at repo root (gitignored; same folder as this repo’s .git):
#   CloudflareToken.txt        — one line, API token
#   CloudflareAccountId.txt     — one line, account ID (32-char hex from Cloudflare dashboard URL or Wrangler output)
#
# Option B — environment variables in this shell:
#   $env:CLOUDFLARE_API_TOKEN
#   $env:CLOUDFLARE_ACCOUNT_ID
#
# Vite reads apps/pwa/.env at build time — add VITE_ABLY_KEY if you want chat/voice on the live site.

$ErrorActionPreference = 'Stop'

# $PSScriptRoot = .../apps/pwa/scripts → repo root is three parents up
$repoRoot = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$tokenFile = Join-Path $repoRoot 'CloudflareToken.txt'
$accountFile = Join-Path $repoRoot 'CloudflareAccountId.txt'

if (-not $env:CLOUDFLARE_API_TOKEN -and (Test-Path $tokenFile)) {
  $env:CLOUDFLARE_API_TOKEN = (Get-Content -Raw $tokenFile).Trim()
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID -and (Test-Path $accountFile)) {
  $env:CLOUDFLARE_ACCOUNT_ID = (Get-Content -Raw $accountFile).Trim()
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host 'Missing CLOUDFLARE_API_TOKEN. Add repo-root CloudflareToken.txt or run:' -ForegroundColor Yellow
  Write-Host '  $env:CLOUDFLARE_API_TOKEN = "<your token>"' -ForegroundColor Gray
  exit 1
}

if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
  Write-Host 'Missing CLOUDFLARE_ACCOUNT_ID. Wrangler needs this for Pages (not supported in wrangler.toml for Pages).' -ForegroundColor Yellow
  Write-Host '  Create repo-root CloudflareAccountId.txt (one line: your account ID), or:' -ForegroundColor Gray
  Write-Host '  $env:CLOUDFLARE_ACCOUNT_ID = "<32-char hex from dash.cloudflare.com profile sidebar / Workers overview>"' -ForegroundColor Gray
  exit 1
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx wrangler pages deploy dist --project-name=peer-support-pwa --commit-dirty=true
exit $LASTEXITCODE
