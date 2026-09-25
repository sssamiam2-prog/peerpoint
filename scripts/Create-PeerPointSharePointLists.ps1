<#
.SYNOPSIS
  Creates PEERPoint SharePoint lists (PeerSupportRequests, SelfHelpContent, PeerSupportMembers, AuditLog) to match docs/sharepoint-lists.md.

.DESCRIPTION
  Requires PnP.PowerShell and a site owner (or admin) account. Run once per SharePoint site.
  Idempotent: skips lists/fields that already exist.

.PARAMETER SiteUrl
  Full site URL, e.g. https://yourtenant.sharepoint.com/sites/SH-PSB

.EXAMPLE
  .\Create-PeerPointSharePointLists.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/PeerSupport"

.NOTES
  After this script, copy list GUIDs into apps/pwa/.env (VITE_GRAPH_*_LIST_ID). For VITE_GRAPH_SITE_ID use
  Graph format hostname,{siteCollectionId},{webId} — see output hints or Graph Explorer GET /sites/{hostname}:/{path}.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SiteUrl
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  Write-Host "Install PnP.PowerShell first:" -ForegroundColor Yellow
  Write-Host "  Install-Module PnP.PowerShell -Scope CurrentUser -Force" -ForegroundColor Yellow
  exit 1
}

Import-Module PnP.PowerShell -ErrorAction Stop
Write-Host "Connecting to $SiteUrl (interactive sign-in)..." -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive

function Ensure-GenericList {
  param([string]$Title)
  $list = Get-PnPList -Identity $Title -ErrorAction SilentlyContinue
  if ($list) {
    Write-Host "  List exists: $Title" -ForegroundColor DarkGray
    return $list
  }
  Write-Host "  Creating list: $Title" -ForegroundColor Green
  return New-PnPList -Title $Title -Template GenericList
}

function Ensure-FieldText {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type Text -Required:$Required
  Write-Host "    + field $InternalName (Text)" -ForegroundColor DarkGreen
}

function Ensure-FieldNote {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type Note -Required:$Required
  Write-Host "    + field $InternalName (Note)" -ForegroundColor DarkGreen
}

function Ensure-FieldNumber {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type Number -Required:$Required
  Write-Host "    + field $InternalName (Number)" -ForegroundColor DarkGreen
}

function Ensure-FieldBool {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type Boolean -Required:$Required
  Write-Host "    + field $InternalName (Yes/No)" -ForegroundColor DarkGreen
}

function Ensure-FieldUrl {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type URL
  Write-Host "    + field $InternalName (Hyperlink)" -ForegroundColor DarkGreen
}

function Ensure-FieldChoice {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [string[]]$Choices, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type Choice -Choices $Choices -Required:$Required
  Write-Host "    + field $InternalName (Choice)" -ForegroundColor DarkGreen
}

function Ensure-FieldDateTime {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName, [switch]$Required)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type DateTime -Required:$Required
  Write-Host "    + field $InternalName (DateTime)" -ForegroundColor DarkGreen
}

function Ensure-FieldIndexed {
  param([string]$ListTitle, [string]$InternalName)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if (-not $f) { return }
  if ($f.Indexed) { return }
  Set-PnPField -List $list -Identity $InternalName -Values @{ Indexed = $true }
  Write-Host "    indexed $InternalName" -ForegroundColor DarkGreen
}

function Ensure-FieldUser {
  param([string]$ListTitle, [string]$InternalName, [string]$DisplayName)
  $list = Get-PnPList -Identity $ListTitle
  $f = Get-PnPField -List $list -Identity $InternalName -ErrorAction SilentlyContinue
  if ($f) { return }
  $null = Add-PnPField -List $list -DisplayName $DisplayName -InternalName $InternalName -Type User
  Write-Host "    + field $InternalName (Person)" -ForegroundColor DarkGreen
}

Write-Host "`n=== PeerSupportRequests ===" -ForegroundColor Cyan
Ensure-GenericList -Title 'PeerSupportRequests' | Out-Null
Ensure-FieldText -ListTitle 'PeerSupportRequests' -InternalName 'RequesterName' -DisplayName 'Requester Name'
Ensure-FieldText -ListTitle 'PeerSupportRequests' -InternalName 'RequesterPhone' -DisplayName 'Requester Phone' -Required
Ensure-FieldText -ListTitle 'PeerSupportRequests' -InternalName 'RequesterEmail' -DisplayName 'Requester Email' -Required
Ensure-FieldNote -ListTitle 'PeerSupportRequests' -InternalName 'PreferredContact' -DisplayName 'Preferred Contact'
Ensure-FieldNote -ListTitle 'PeerSupportRequests' -InternalName 'Description' -DisplayName 'Description'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ConsentAcknowledged' -DisplayName 'Consent Acknowledged' -Required
Ensure-FieldChoice -ListTitle 'PeerSupportRequests' -InternalName 'Status' -DisplayName 'Status' -Choices @('New', 'Assigned', 'InProgress', 'Closed') -Required
Ensure-FieldUser -ListTitle 'PeerSupportRequests' -InternalName 'AssignedPeerSupporter' -DisplayName 'Assigned Peer Supporter'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ShowNameToPeer' -DisplayName 'Show Name To Peer'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ShowPhoneToPeer' -DisplayName 'Show Phone To Peer'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ShowEmailToPeer' -DisplayName 'Show Email To Peer'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ShowPreferredContactToPeer' -DisplayName 'Show Preferred Contact To Peer'
Ensure-FieldBool -ListTitle 'PeerSupportRequests' -InternalName 'ShowDescriptionToPeer' -DisplayName 'Show Description To Peer'

Write-Host "`n=== SelfHelpContent ===" -ForegroundColor Cyan
Ensure-GenericList -Title 'SelfHelpContent' | Out-Null
Ensure-FieldNote -ListTitle 'SelfHelpContent' -InternalName 'Body' -DisplayName 'Body'
Ensure-FieldUrl -ListTitle 'SelfHelpContent' -InternalName 'Url' -DisplayName 'Url'
Ensure-FieldText -ListTitle 'SelfHelpContent' -InternalName 'Category' -DisplayName 'Category'
Ensure-FieldNumber -ListTitle 'SelfHelpContent' -InternalName 'SortOrder' -DisplayName 'Sort Order'
Ensure-FieldBool -ListTitle 'SelfHelpContent' -InternalName 'IsPublished' -DisplayName 'Is Published'

Write-Host "`n=== PeerSupportMembers (roster + ACL) ===" -ForegroundColor Cyan
Ensure-GenericList -Title 'PeerSupportMembers' | Out-Null
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'FirstName' -DisplayName 'First Name' -Required
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'LastName' -DisplayName 'Last Name' -Required
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'Username' -DisplayName 'Username' -Required
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'Area' -DisplayName 'Area'
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'WorkPhone' -DisplayName 'Work Phone'
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'CellPhone' -DisplayName 'Cell Phone'
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'Email' -DisplayName 'Email' -Required
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'Shift' -DisplayName 'Shift'
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'JobTitle' -DisplayName 'Job Title'
Ensure-FieldChoice -ListTitle 'PeerSupportMembers' -InternalName 'AppRole' -DisplayName 'App Role' -Choices @('staff', 'admin') -Required
Ensure-FieldBool -ListTitle 'PeerSupportMembers' -InternalName 'IsPeerSupportLeader' -DisplayName 'Is Peer Support Leader' -Required
Ensure-FieldBool -ListTitle 'PeerSupportMembers' -InternalName 'Active' -DisplayName 'Active' -Required
Ensure-FieldText -ListTitle 'PeerSupportMembers' -InternalName 'AclGroup' -DisplayName 'ACL Group'
Ensure-FieldUser -ListTitle 'PeerSupportMembers' -InternalName 'EntraUser' -DisplayName 'Entra User'
Write-Host "  Note: do NOT add a Password column. Passwords stay in the PWA (hashed)." -ForegroundColor Yellow

Write-Host "`n=== PeerSupportEvents (staff event logger → Power Automate sync) ===" -ForegroundColor Cyan
Ensure-GenericList -Title 'PeerSupportEvents' | Out-Null
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'PeerPointEventId' -DisplayName 'PeerPoint Event Id' -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'EventDate' -DisplayName 'Event Date' -Required
Ensure-FieldDateTime -ListTitle 'PeerSupportEvents' -InternalName 'EventDateValue' -DisplayName 'Event Date (sortable)'
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'RecordedAt' -DisplayName 'Recorded At' -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'PrpsBureau' -DisplayName 'PRPS Bureau' -Required
Ensure-FieldChoice -ListTitle 'PeerSupportEvents' -InternalName 'PrpsGender' -DisplayName 'PRPS Gender' -Choices @('male', 'female', 'nonBinary', 'preferNotToSay', 'unknown') -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'HelpType' -DisplayName 'Type of Help' -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'ProviderDisplayName' -DisplayName 'Peer Supporter' -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'ProviderUsername' -DisplayName 'Provider Username'
Ensure-FieldNumber -ListTitle 'PeerSupportEvents' -InternalName 'TotalMinutes' -DisplayName 'Total Minutes' -Required
Ensure-FieldText -ListTitle 'PeerSupportEvents' -InternalName 'CreatedByDisplay' -DisplayName 'Logged By'
Ensure-FieldIndexed -ListTitle 'PeerSupportEvents' -InternalName 'ProviderDisplayName'
Ensure-FieldIndexed -ListTitle 'PeerSupportEvents' -InternalName 'HelpType'
Ensure-FieldIndexed -ListTitle 'PeerSupportEvents' -InternalName 'EventDate'
Write-Host "  MSE search UI: sharepoint/mse-logged-events-app → Site Assets (see docs/mse-logged-events-app.md)" -ForegroundColor Yellow

Write-Host "`n=== AuditLog ===" -ForegroundColor Cyan
Ensure-GenericList -Title 'AuditLog' | Out-Null
$auditChoices = @(
  'RequestCreated', 'RequestAssigned', 'RequestVisibilityChanged', 'RequestStatusChanged',
  'RequestViewed', 'SelfHelpViewed'
)
Ensure-FieldChoice -ListTitle 'AuditLog' -InternalName 'EventType' -DisplayName 'Event Type' -Choices $auditChoices -Required
Ensure-FieldNumber -ListTitle 'AuditLog' -InternalName 'RequestId' -DisplayName 'Request Id'
Ensure-FieldNote -ListTitle 'AuditLog' -InternalName 'DetailsJson' -DisplayName 'Details Json'

Write-Host "`n=== List IDs (for PWA .env) ===" -ForegroundColor Cyan
foreach ($name in @('PeerSupportRequests', 'SelfHelpContent', 'PeerSupportMembers', 'PeerSupportEvents', 'AuditLog')) {
  $l = Get-PnPList -Identity $name
  Write-Host ("  {0,-22} {1}" -f $name, $l.Id)
}

$ctx = Get-PnPContext
$site = Get-PnPSite -Includes Id, Url
$web = Get-PnPWeb -Includes Id, Url, ServerRelativeUrl
Write-Host "`n=== Graph site id hint ===" -ForegroundColor Cyan
Write-Host "  Host: $($ctx.Url.Host)"
Write-Host "  Site collection Id: $($site.Id)"
Write-Host "  Web Id: $($web.Id)"
Write-Host "  Web server-relative URL: $($web.ServerRelativeUrl)"
Write-Host @"

  Build VITE_GRAPH_SITE_ID as:
    {hostname},{siteCollectionId},{webId}
  Example pattern (replace with values above):
    $($ctx.Url.Host),$($site.Id),$($web.Id)

  Set in apps/pwa/.env:
    VITE_GRAPH_SITE_ID=...
    VITE_GRAPH_REQUESTS_LIST_ID=(PeerSupportRequests GUID above)
    VITE_GRAPH_SELFHELP_LIST_ID=(SelfHelpContent GUID)
    VITE_GRAPH_AUDIT_LIST_ID=(AuditLog GUID)

  Then sync roster (no passwords):
    .\Sync-PeerSupportMembers.ps1 -SiteUrl "<same SiteUrl>"

  Bootstrap PWA passwords (lowercase firstInitial+lastName+1234, e.g. ssmith1234) via Provision-PeerSupportPwaAccounts.ps1.
  Entra: grant Sites.Selected or delegated Sites.ReadWrite.All + list permissions per your registration.
  SharePoint groups (see docs/security-hardening.md): PeerSupport_Admins, PeerSupport_HR, PeerSupport_PeerSupporters
"@ -ForegroundColor Yellow

Write-Host "`nDone. Disconnecting." -ForegroundColor Cyan
Disconnect-PnPOnline
