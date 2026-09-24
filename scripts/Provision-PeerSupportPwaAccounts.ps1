<#
.SYNOPSIS
  Provisions or resets PWA staff accounts from data/peer-support-members.json.

.DESCRIPTION
  Calls POST /api/staff/accounts with provision:true.
  Initial password = lowercase firstInitial + lastName + 1234 (e.g. ssmith1234).
  Accounts are flagged mustChangePassword so first login forces a password change.

.PARAMETER BaseUrl
  PWA origin, e.g. https://mypeerpoint.com or https://admin.mypeerpoint.com

.PARAMETER AdminToken
  Bearer token from an Admin session (DevTools / login response).

.PARAMETER MembersJson
  Path to seed JSON.

.PARAMETER ResetExisting
  If set, also reset passwords for accounts that already exist (matched by email).
  Without this switch, existing accounts are left unchanged; new accounts still get the pattern password.

.EXAMPLE
  .\Provision-PeerSupportPwaAccounts.ps1 -BaseUrl "https://mypeerpoint.com" -AdminToken "..." -ResetExisting
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$AdminToken,

  [string]$MembersJson = "",

  [switch]$ResetExisting
)

if (-not $MembersJson) {
  $root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $MembersJson = Join-Path $root '..\data\peer-support-members.json'
}

$ErrorActionPreference = 'Stop'

function Get-InitialPassword {
  param([string]$FirstName, [string]$LastName)
  $fi = $FirstName.Trim().Substring(0, 1).ToLowerInvariant()
  $ln = ($LastName -replace "[^A-Za-z'-]", '').Trim().ToLowerInvariant()
  if (-not $ln) { throw "Missing last name for $FirstName" }
  return "$fi${ln}1234"
}

if (-not (Test-Path -LiteralPath $MembersJson)) {
  throw "Members JSON not found: $MembersJson"
}

$payload = Get-Content -LiteralPath $MembersJson -Raw -Encoding UTF8 | ConvertFrom-Json
$members = @($payload.members)
$base = $BaseUrl.TrimEnd('/')
$headers = @{
  Authorization  = "Bearer $AdminToken"
  'Content-Type' = 'application/json'
}

Write-Host "Provisioning $($members.Count) accounts against $base ..." -ForegroundColor Cyan
$created = 0
$reused = 0
$reset = 0
$failed = 0

foreach ($m in $members) {
  $tempPw = Get-InitialPassword -FirstName ([string]$m.firstName) -LastName ([string]$m.lastName)
  $bodyObj = @{
    provision           = $true
    firstName           = [string]$m.firstName
    lastName            = [string]$m.lastName
    bureau              = [string]$m.area
    jobTitle            = [string]$m.jobTitle
    email               = [string]$m.email
    username            = [string]$m.email
    cellPhone           = [string]$m.cellPhone
    workPhone           = [string]$m.workPhone
    currentShift        = if ([string]$m.shift) { [string]$m.shift } else { 'Days' }
    role                = if ($m.appRole) { [string]$m.appRole } else { 'staff' }
    isPeerSupportLeader = [bool]$m.isPeerSupportLeader
    temporaryPassword   = $tempPw
  }

  # Without -ResetExisting, omit temporaryPassword so reuse does not overwrite passwords.
  # New accounts still need a password: API generates PeerTemp… then we PATCH to the pattern.
  if (-not $ResetExisting) {
    $bodyObj.Remove('temporaryPassword')
  }

  $body = $bodyObj | ConvertTo-Json -Compress

  try {
    $res = Invoke-RestMethod -Method Post -Uri "$base/api/staff/accounts" -Headers $headers -Body $body
    if ($res.provisioned) {
      if (-not $ResetExisting) {
        $patch = @{
          username          = $res.account.username
          temporaryPassword = $tempPw
        } | ConvertTo-Json -Compress
        $null = Invoke-RestMethod -Method Patch -Uri "$base/api/staff/accounts" -Headers $headers -Body $patch
      }
      $created++
      Write-Host "  Created $($m.username)  temp=$tempPw" -ForegroundColor Green
    } elseif ($res.reused) {
      $reused++
      if ($ResetExisting) {
        $reset++
        Write-Host "  Reset  $($m.username)  temp=$tempPw (must change on next login)" -ForegroundColor Yellow
      } else {
        Write-Host "  Exists $($m.username)" -ForegroundColor DarkGray
      }
    } else {
      Write-Host "  OK     $($m.username)" -ForegroundColor DarkGray
    }
  } catch {
    $failed++
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "  FAIL   $($m.username): $msg" -ForegroundColor Red
  }
}

Write-Host "`nDone. created=$created reused=$reused reset=$reset failed=$failed" -ForegroundColor Cyan
Write-Host "Users must change password on first login. Forgot password is on the Staff sign-in page." -ForegroundColor Yellow
