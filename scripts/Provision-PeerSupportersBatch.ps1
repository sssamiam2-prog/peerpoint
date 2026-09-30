<#
.SYNOPSIS
  Provision specific peer supporters on production and email password reset links.

.PARAMETER BaseUrl
  Default https://admin.mypeerpoint.com

.PARAMETER AdminToken
  Admin Bearer token (from browser after login).

.EXAMPLE
  $env:ADMIN_TOKEN = '...'
  .\Provision-PeerSupportersBatch.ps1
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = 'https://admin.mypeerpoint.com',
  [string]$AdminToken = $env:ADMIN_TOKEN
)

$ErrorActionPreference = 'Stop'

if (-not $AdminToken) {
  Write-Host 'Set ADMIN_TOKEN or pass -AdminToken (Admin session Bearer from DevTools).' -ForegroundColor Yellow
  exit 1
}

function Get-InitialPassword([string]$FirstName, [string]$LastName) {
  $fi = $FirstName.Trim().Substring(0, 1).ToLowerInvariant()
  $ln = ($LastName -replace "[^A-Za-z'-]", '').Trim().ToLowerInvariant()
  return "$fi${ln}1234"
}

$people = @(
  @{ firstName = 'Lindsey'; lastName = 'Moseley'; email = 'lmoseley@saltlakecounty.gov'; bureau = 'HR'; jobTitle = 'Team Member'; cellPhone = '' },
  @{ firstName = 'Ty'; lastName = 'Clemans'; email = 'tclemans@saltlakecounty.gov'; bureau = "Sheriff's Office"; jobTitle = 'Team Member'; cellPhone = '' },
  @{ firstName = 'Kassandra'; lastName = 'Peterson'; email = 'kasperterson@saltlakecounty.gov'; bureau = 'Training - Professional Standards Division'; jobTitle = 'Team Member'; cellPhone = '385-468-2341' }
)

$base = $BaseUrl.TrimEnd('/')
$headers = @{
  Authorization  = "Bearer $AdminToken"
  'Content-Type' = 'application/json'
}

foreach ($p in $people) {
  $tempPw = Get-InitialPassword $p.firstName $p.lastName
  $body = @{
    provision              = $true
    firstName              = $p.firstName
    lastName               = $p.lastName
    bureau                 = $p.bureau
    jobTitle               = $p.jobTitle
    email                  = $p.email
    cellPhone              = if ($p.cellPhone) { $p.cellPhone } else { '8015550100' }
    role                   = 'staff'
    temporaryPassword      = $tempPw
    sendPasswordResetEmail = $true
  } | ConvertTo-Json -Compress

  try {
    $res = Invoke-RestMethod -Method Post -Uri "$base/api/staff/accounts" -Headers $headers -Body $body
    if ($res.reused -and -not $res.temporaryPassword) {
      $patch = @{
        username               = $res.account.username
        temporaryPassword      = $tempPw
        sendPasswordResetEmail = $true
      } | ConvertTo-Json -Compress
      $res = Invoke-RestMethod -Method Patch -Uri "$base/api/staff/accounts" -Headers $headers -Body $patch
    }
    $emailed = if ($null -ne $res.passwordResetEmailed) { $res.passwordResetEmailed } else { 'n/a' }
    Write-Host "OK $($p.email)  temp=$tempPw  resetEmailed=$emailed" -ForegroundColor Green
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "FAIL $($p.email): $msg" -ForegroundColor Red
  }
}

Write-Host 'Done. Members should use the reset link in email (expires in 1 hour) or sign in with temp password and change on first login.' -ForegroundColor Cyan
