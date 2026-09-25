<#
.SYNOPSIS
  Uploads the MSE Logged Events search app to SharePoint Site Assets.

.PARAMETER SiteUrl
  e.g. https://slcounty.sharepoint.com/sites/SH-PS

.PARAMETER Folder
  Server-relative folder under the web (default SiteAssets/PeerPoint/LoggedEvents)

.EXAMPLE
  .\Deploy-PeerSupportLoggedEventsApp.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,
  [string]$Folder = 'SiteAssets/PeerPoint/LoggedEvents'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root 'sharepoint\mse-logged-events-app'

if (-not (Test-Path $appDir)) {
  Write-Error "App folder not found: $appDir"
}

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host "Install-Module PnP.PowerShell -Scope CurrentUser -Force" -ForegroundColor Yellow
  exit 1
}

Import-Module PnP.PowerShell
Connect-PnPOnline -Url $SiteUrl -Interactive

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

foreach ($file in @('index.html', 'app.css', 'app.js')) {
  $local = Join-Path $appDir $file
  Add-PnPFile -Path $local -Folder $folderUrl -NewFileName $file -ErrorAction Stop
  Write-Host "Uploaded $file" -ForegroundColor Green
}

$pageUrl = "$($web.Url)/SitePages/Peer-Support-Logged-Events.aspx"
$embedUrl = "$($web.Url)/$folderUrl/index.html"
Write-Host @"

Done.

1. Open the site page (create if needed):
   $pageUrl

2. Edit the page → add an **Embed** web part → paste this URL:
   $embedUrl

3. Add a **Power Automate** button web part for flow:
   PEERPoint — Sync Peer Support Events
   (see docs/peer-support-events-power-automate-flow.md)

4. Publish the page. Site members with read access to PeerSupportEvents can search;
   only owners should run the sync flow.

"@ -ForegroundColor Cyan

Disconnect-PnPOnline
