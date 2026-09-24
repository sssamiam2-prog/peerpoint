<#
.SYNOPSIS
  Upserts Peer Support Members into the SharePoint PeerSupportMembers list from data/peer-support-members.json.

.DESCRIPTION
  Idempotent by Email (preferred) or Username. Does NOT write passwords — use Provision-PeerSupportPwaAccounts.ps1 for PWA auth.

.PARAMETER SiteUrl
  SharePoint site URL, e.g. https://slcounty.sharepoint.com/sites/SH-PSB

.PARAMETER MembersJson
  Path to seed JSON (default: repo data/peer-support-members.json)

.EXAMPLE
  .\Sync-PeerSupportMembers.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PSB"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,

  [string]$MembersJson = (Join-Path $PSScriptRoot '..\data\peer-support-members.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host "Install PnP.PowerShell first: Install-Module PnP.PowerShell -Scope CurrentUser -Force" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath $MembersJson)) {
  throw "Members JSON not found: $MembersJson"
}

$payload = Get-Content -LiteralPath $MembersJson -Raw -Encoding UTF8 | ConvertFrom-Json
$members = @($payload.members)
if ($members.Count -eq 0) { throw 'No members in JSON.' }

Import-Module PnP.PowerShell -ErrorAction Stop
Write-Host "Connecting to $SiteUrl..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive

$listTitle = 'PeerSupportMembers'
$list = Get-PnPList -Identity $listTitle -ErrorAction SilentlyContinue
if (-not $list) {
  throw "List '$listTitle' not found. Run Create-PeerPointSharePointLists.ps1 first."
}

$existing = Get-PnPListItem -List $listTitle -PageSize 2000
$emailMap = @{}
$userMap = @{}
foreach ($item in $existing) {
  $em = [string]$item['Email']
  $un = [string]$item['Username']
  if ($em) { $emailMap[$em.Trim().ToLowerInvariant()] = $item }
  if ($un) { $userMap[$un.Trim().ToLowerInvariant()] = $item }
}

$created = 0
$updated = 0
foreach ($m in $members) {
  $email = [string]$m.email
  $username = [string]$m.username
  $keyEmail = $email.Trim().ToLowerInvariant()
  $keyUser = $username.Trim().ToLowerInvariant()
  $values = @{
    Title               = [string]$m.title
    FirstName           = [string]$m.firstName
    LastName            = [string]$m.lastName
    Username            = $username
    Area                = [string]$m.area
    WorkPhone           = [string]$m.workPhone
    CellPhone           = [string]$m.cellPhone
    Email               = $email
    Shift               = [string]$m.shift
    JobTitle            = [string]$m.jobTitle
    AppRole             = if ($m.appRole) { [string]$m.appRole } else { 'staff' }
    IsPeerSupportLeader = [bool]$m.isPeerSupportLeader
    Active              = if ($null -ne $m.active) { [bool]$m.active } else { $true }
    AclGroup            = if ($m.aclGroup) { [string]$m.aclGroup } else { 'PeerSupport_PeerSupporters' }
  }

  $match = $null
  if ($keyEmail -and $emailMap.ContainsKey($keyEmail)) { $match = $emailMap[$keyEmail] }
  elseif ($keyUser -and $userMap.ContainsKey($keyUser)) { $match = $userMap[$keyUser] }

  if ($match) {
    Set-PnPListItem -List $listTitle -Identity $match.Id -Values $values | Out-Null
    $updated++
    Write-Host "  Updated: $($m.title)" -ForegroundColor DarkGray
  } else {
    $newItem = Add-PnPListItem -List $listTitle -Values $values
    $created++
    if ($keyEmail) { $emailMap[$keyEmail] = $newItem }
    if ($keyUser) { $userMap[$keyUser] = $newItem }
    Write-Host "  Created: $($m.title)" -ForegroundColor Green
  }
}

Write-Host "`nDone. Created $created, updated $updated (of $($members.Count)). Passwords were not written." -ForegroundColor Cyan
Disconnect-PnPOnline
