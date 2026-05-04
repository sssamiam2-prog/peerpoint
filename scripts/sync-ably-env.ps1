# Reads Ably API key from repo root and writes apps/pwa/.env (does not print the key).
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$candidates = @(
  (Join-Path $root 'Ably_API_Ket7'),
  (Join-Path $root 'Ably_API_Ket7.txt'),
  (Join-Path $root 'Ably_API_Key.txt'),
  (Join-Path $root 'Ably_API_Key')
)
$keyPath = $null
foreach ($p in $candidates) {
  if (Test-Path -LiteralPath $p) {
    $keyPath = $p
    break
  }
}
if (-not $keyPath) {
  Write-Host 'No key file found. Save your key in the repo root as one of:'
  Write-Host '  Ably_API_Ket7'
  Write-Host '  Ably_API_Ket7.txt'
  Write-Host '  Ably_API_Key'
  Write-Host '  Ably_API_Key.txt'
  exit 1
}
$key = (Get-Content -LiteralPath $keyPath -Raw).Trim()
$key = $key.TrimStart([char]0xFEFF)
$key = ($key -split "`r?`n", 2)[0].Trim()
if ($key.StartsWith('"') -and $key.EndsWith('"')) { $key = $key.Substring(1, $key.Length - 2).Trim() }
if ($key.StartsWith("'") -and $key.EndsWith("'")) { $key = $key.Substring(1, $key.Length - 2).Trim() }
$key = $key -replace '\s+', ''
if ($key.Length -lt 30 -or $key -notmatch ':' -or $key -notmatch '\.') {
  Write-Error 'The file does not look like a full Ably API key (expect format like xxx.yyy:secret, one line).'
  exit 1
}
$pwaEnv = Join-Path $root 'apps\pwa\.env'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($pwaEnv, "VITE_ABLY_KEY=$key", $utf8NoBom)
Write-Host "OK: wrote $pwaEnv"
Write-Host 'Restart the dev server: cd apps/pwa; npm run dev'
