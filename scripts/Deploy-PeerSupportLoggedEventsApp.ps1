<#
.SYNOPSIS
  Uploads the MSE Logged Events search app to SharePoint Site Assets and embeds it on the site page.

.PARAMETER SiteUrl
  e.g. https://slcounty.sharepoint.com/sites/SH-PS

.PARAMETER Folder
  Server-relative folder under the web (default SiteAssets/PeerPoint/LoggedEvents)

.PARAMETER PageName
  Site page file name without extension (default Peer-Support-Logged-Events)

.PARAMETER SkipPageWire
  Upload files only; do not update the Embed web part on the site page.

.EXAMPLE
  .\Deploy-PeerSupportLoggedEventsApp.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,
  [string]$Folder = 'SiteAssets/PeerPoint/LoggedEvents',
  [string]$PageName = 'Peer-Support-Logged-Events',
  [switch]$SkipPageWire
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
  Write-Error "PnP.PowerShell 3.x requires PowerShell 7+. Run: pwsh -File `"$PSCommandPath`" -SiteUrl `"$SiteUrl`""
}
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root 'sharepoint\mse-logged-events-app'

if (-not (Test-Path $appDir)) {
  Write-Error "App folder not found: $appDir"
}

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host "Installing PnP.PowerShell (CurrentUser)..." -ForegroundColor Yellow
  Install-Module PnP.PowerShell -Scope CurrentUser -Force -AllowClobber
}

Import-Module PnP.PowerShell

if ($env:PEERPOINT_PNP_CLIENT_ID) {
  Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $env:PEERPOINT_PNP_CLIENT_ID
} else {
  Connect-PnPOnline -Url $SiteUrl -Interactive
}

$web = Get-PnPWeb
$folderUrl = ($Folder -replace '\\', '/').Trim('/')
$parts = $folderUrl -split '/'
$accum = ''
foreach ($p in $parts) {
  $accum = if ($accum) { "$accum/$p" } else { $p }
  $exists = Get-PnPFolder -Url $accum -ErrorAction SilentlyContinue
  if (-not $exists) {
    if ($accum -eq $parts[0]) {
      Write-Host "Using root folder: $accum" -ForegroundColor DarkGray
    } else {
      $parent = ($accum -split '/')[0..(($accum -split '/').Length - 2)] -join '/'
      Add-PnPFolder -Name $p -Folder $parent | Out-Null
      Write-Host "Created folder: $accum" -ForegroundColor Green
    }
  }
}

$webRel = $web.ServerRelativeUrl.TrimEnd('/')
foreach ($file in @('index.html', 'app.css', 'app.js')) {
  $local = Join-Path $appDir $file
  $serverRelative = "$webRel/$folderUrl/$file"
  if (Get-PnPFile -Url $serverRelative -ErrorAction SilentlyContinue) {
    Remove-PnPFile -ServerRelativeUrl $serverRelative -Force
  }
  Add-PnPFile -Path $local -Folder $folderUrl -NewFileName $file -ErrorAction Stop | Out-Null
  Write-Host "Uploaded $file" -ForegroundColor Green
}

$assetBaseUrl = "$($web.Url.TrimEnd('/'))/$folderUrl"
$embedUrl = "$assetBaseUrl/index.html"
Write-Host "Site Assets folder: $assetBaseUrl" -ForegroundColor Cyan
Write-Host "Note: opening index.html from a library usually downloads; embed inline markup on the site page (see Export-MseInlineSnippet.ps1)." -ForegroundColor DarkYellow

function Get-PeerPointMseInlineMarkup {
  param([string]$BaseUrl)
  $null = $BaseUrl
  $snippetPath = Join-Path $env:TEMP "PeerPoint-MseInline-$([guid]::NewGuid().ToString('n')).html"
  & (Join-Path $PSScriptRoot 'Export-MseInlineSnippet.ps1') -AssetBaseUrl 'https://placeholder' -OutFile $snippetPath | Out-Null
  try {
    return Get-Content -Path $snippetPath -Raw -Encoding UTF8
  } finally {
    Remove-Item -Path $snippetPath -Force -ErrorAction SilentlyContinue
  }
}

$inlineMarkup = Get-PeerPointMseInlineMarkup -BaseUrl $assetBaseUrl
$snippetPath = Join-Path $appDir 'mse-inline.generated.html'
Set-Content -Path $snippetPath -Value $inlineMarkup -Encoding UTF8
Write-Host "Inline MSE snippet: $snippetPath" -ForegroundColor Cyan

if (-not $SkipPageWire) {
  $page = Get-PnPPage -Identity $PageName -ErrorAction SilentlyContinue
  if (-not $page) {
    Write-Host "Creating site page: $PageName" -ForegroundColor Yellow
    $page = Add-PnPPage -Name $PageName -Title 'Peer Support Logged Events' -LayoutType SingleColumn
  }

  $toRemove = @($page.Controls)
  foreach ($control in $toRemove) {
    $page.RemoveControl($control)
  }

  # Do not iframe index.html — SharePoint serves library HTML as a download, not inline.
  Add-PnPPageWebPart -Page $page -DefaultWebPartType ContentEmbed -WebPartProperties @{
    embedCode = $inlineMarkup
  } | Out-Null

  $page.Save() | Out-Null
  $page.Publish() | Out-Null
  Write-Host "Page wired and published: $($web.Url)/SitePages/$PageName.aspx" -ForegroundColor Green
}

Write-Host @"

Done.

Embed URL (Site Assets):
  $embedUrl

Site page:
  $($web.Url)/SitePages/$PageName.aspx

Optional: add a Power Automate button web part for flow
  PEERPoint — Sync Peer Support Events
  (see docs/peer-support-events-power-automate-flow.md)

"@ -ForegroundColor Cyan

Disconnect-PnPOnline
