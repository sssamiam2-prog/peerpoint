<#
.SYNOPSIS
  Restricts PeerSupportEvents (and optionally the Logged Events site page) to site owners + PeerSupport_Admins.

.DESCRIPTION
  Breaks inheritance so general site members/visitors cannot read synced event rows.
  Power Automate sync still works when the flow connection runs as a user who retains
  Contribute+ on the list (typically a site owner or an account you grant explicitly).

.PARAMETER SiteUrl
  e.g. https://slcounty.sharepoint.com/sites/SH-PS

.PARAMETER AdminGroupName
  SharePoint site group for program admins (default PeerSupport_Admins).

.PARAMETER RestrictLoggedEventsPage
  Also break inheritance on Site Pages item Peer-Support-Logged-Events.aspx.

.PARAMETER FlowRunnerEmail
  Optional UPN/email to grant Contribute (for Power Automate connection account).

.EXAMPLE
  pwsh -File .\Set-PeerSupportEventsListPermissions.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS" -RestrictLoggedEventsPage
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl,
  [string]$AdminGroupName = 'PeerSupport_Admins',
  [switch]$RestrictLoggedEventsPage,
  [string]$FlowRunnerEmail = '',
  [string[]]$AdditionalFullControlEmail = @()
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
  Write-Error "Requires PowerShell 7+. Run: pwsh -File `"$PSCommandPath`" ..."
}

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host 'Install PnP.PowerShell: Install-Module PnP.PowerShell -Scope CurrentUser -Force' -ForegroundColor Yellow
  exit 1
}
Import-Module PnP.PowerShell

if ($env:PEERPOINT_PNP_CLIENT_ID) {
  Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $env:PEERPOINT_PNP_CLIENT_ID
} else {
  Connect-PnPOnline -Url $SiteUrl -Interactive
}

function Grant-ListAccess {
  param(
    [Parameter(Mandatory = $true)]
    $List,
    [Parameter(Mandatory = $true)]
    [string]$OwnersGroupTitle
  )

  if (-not $List.HasUniqueRoleAssignments) {
    Set-PnPList -Identity $List -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$true
    Write-Host "  Broke inheritance on $($List.Title)" -ForegroundColor Green
  } else {
    Write-Host "  $($List.Title) already has unique permissions" -ForegroundColor DarkGray
  }

  Set-PnPListPermission -List $List -Group $OwnersGroupTitle -AddRole 'Full Control' | Out-Null
  Write-Host "  Full Control: $OwnersGroupTitle" -ForegroundColor DarkGreen

  $adminGroup = Get-PnPGroup -Identity $AdminGroupName -ErrorAction SilentlyContinue
  if (-not $adminGroup) {
    Write-Host "  Creating site group: $AdminGroupName" -ForegroundColor Yellow
    New-PnPGroup -Title $AdminGroupName -Description 'PEERPoint program admins (read logged events)' | Out-Null
  }
  Set-PnPListPermission -List $List -Group $AdminGroupName -AddRole 'Read' | Out-Null
  Write-Host "  Read: $AdminGroupName (add PWA admin users in Site permissions)" -ForegroundColor DarkGreen

  if ($FlowRunnerEmail) {
    Set-PnPListPermission -List $List -User $FlowRunnerEmail -AddRole 'Contribute' | Out-Null
    Write-Host "  Contribute (flow): $FlowRunnerEmail" -ForegroundColor DarkGreen
  }

  foreach ($email in $AdditionalFullControlEmail) {
    if (-not $email) { continue }
    Set-PnPListPermission -List $List -User $email.Trim() -AddRole 'Full Control' | Out-Null
    Write-Host "  Full Control: $email" -ForegroundColor DarkGreen
  }
}

function Grant-SitePageAccess {
  param(
    [string]$PageFileName,
    [string]$OwnersGroupTitle
  )

  $pages = Get-PnPList -Identity 'Site Pages'
  $item = Get-PnPListItem -List $pages -Query @"
<View>
  <Query>
    <Where><Eq><FieldRef Name='FileLeafRef'/><Value Type='Text'>$PageFileName</Value></Eq></Where>
  </Query>
  <RowLimit>1</RowLimit>
</View>
"@
  if (-not $item) {
    Write-Warning "Site page $PageFileName not found; skip page permissions."
    return
  }

  Set-PnPListItemPermission -List $pages -Identity $item.Id -BreakRoleInheritance -CopyRoleAssignments:$false -ClearSubscopes:$true
  Set-PnPListItemPermission -List $pages -Identity $item.Id -Group $OwnersGroupTitle -AddRole 'Full Control' | Out-Null
  if (-not (Get-PnPGroup -Identity $AdminGroupName -ErrorAction SilentlyContinue)) {
    New-PnPGroup -Title $AdminGroupName -Description 'PEERPoint program admins (read logged events)' | Out-Null
  }
  Set-PnPListItemPermission -List $pages -Identity $item.Id -Group $AdminGroupName -AddRole 'Read' | Out-Null
  foreach ($email in $AdditionalFullControlEmail) {
    if (-not $email) { continue }
    Set-PnPListItemPermission -List $pages -Identity $item.Id -User $email.Trim() -AddRole 'Full Control' | Out-Null
  }
  Write-Host "  Restricted site page: $PageFileName" -ForegroundColor Green
}

$ownersGroup = Get-PnPGroup -AssociatedOwnerGroup
$ownersTitle = $ownersGroup.Title
Write-Host "`n=== PeerSupportEvents permissions ===" -ForegroundColor Cyan
Write-Host "  Owners group: $ownersTitle" -ForegroundColor DarkGray

$list = Get-PnPList -Identity 'PeerSupportEvents' -ErrorAction Stop
Grant-ListAccess -List $list -OwnersGroupTitle $ownersTitle

if ($RestrictLoggedEventsPage) {
  Write-Host "`n=== Logged Events site page ===" -ForegroundColor Cyan
  Grant-SitePageAccess -PageFileName 'Peer-Support-Logged-Events.aspx' -OwnersGroupTitle $ownersTitle
}

Write-Host "`nDone. Site members and visitors should no longer read event rows." -ForegroundColor Cyan
Write-Host "Verify: sign in as a non-admin member and open the list (expect access denied)." -ForegroundColor DarkGray
