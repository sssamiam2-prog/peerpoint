<#
.SYNOPSIS
  Builds Modern Script Editor markup with inlined CSS/JS (external link/script tags are stripped by MSE).

.PARAMETER AssetBaseUrl
  Kept for compatibility; snippet is self-contained and does not reference Site Assets URLs.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$AssetBaseUrl,
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root 'sharepoint\mse-logged-events-app'
$indexPath = Join-Path $appDir 'index.html'
$cssPath = Join-Path $appDir 'app.css'
$jsPath = Join-Path $appDir 'app.js'

foreach ($p in @($indexPath, $cssPath, $jsPath)) {
  if (-not (Test-Path $p)) { throw "Missing $p" }
}

$html = Get-Content -Path $indexPath -Raw -Encoding UTF8
if ($html -notmatch '(?s)<body[^>]*>(.*)</body>') {
  throw 'index.html has no <body>'
}
$body = $Matches[1].Trim()
$body = $body -replace '(?s)\s*<link[^>]*app\.css[^>]*>\s*', "`n"
$body = $body -replace '(?s)\s*<script[^>]*app\.js[^>]*>\s*</script>\s*', "`n"

$css = Get-Content -Path $cssPath -Raw -Encoding UTF8
$js = Get-Content -Path $jsPath -Raw -Encoding UTF8
$js = $js -replace '</script>', '<\/script>'

$snippet = @"
<style>
$css
</style>
$body
<script>
$js
</script>
"@

if ($OutFile) {
  Set-Content -Path $OutFile -Value $snippet -Encoding UTF8 -NoNewline
  Write-Host "Wrote $OutFile ($($snippet.Length) chars)" -ForegroundColor Green
} else {
  $snippet
}
