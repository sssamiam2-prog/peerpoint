<#
.SYNOPSIS
  Daily-style health report for SLCO PEERPoint (mypeerpoint.com), not peerpoint.com.

.DESCRIPTION
  Prints PASS/FAIL lines similar to common domain monitor emails. Use for Task Scheduler
  or manual runs. Does not send email — pipe to your mail tool or use GitHub Actions.

.EXAMPLE
  .\Monitor-MypeerpointHealth.ps1
  .\Monitor-MypeerpointHealth.ps1 -Strict
#>
[CmdletBinding()]
param(
  [switch] $Strict
)

$ErrorActionPreference = 'Continue'
$DnsServer = '8.8.8.8'
$Label = 'PEERPoint (mypeerpoint.com)'
$results = @()

function Add-Check {
  param([string] $Name, [bool] $Ok, [string] $Detail)
  $script:results += [pscustomobject]@{
    Name   = $Name
    Ok     = $Ok
    Detail = $Detail
  }
}

function Test-Https {
  param([string] $Url, [string] $ContentNeedle = 'PEERPoint')
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30 -MaximumRedirection 5
    if ($r.StatusCode -ne 200) {
      return @{ Ok = $false; Detail = "HTTP $($r.StatusCode)" }
    }
    if ($ContentNeedle -and ($r.Content -notmatch [regex]::Escape($ContentNeedle))) {
      return @{ Ok = $false; Detail = "HTTP 200 but missing expected content ($ContentNeedle)" }
    }
    return @{ Ok = $true; Detail = 'HTTP 200, expected content found' }
  } catch {
    return @{ Ok = $false; Detail = $_.Exception.Message }
  }
}

$homeCheck = Test-Https -Url 'https://mypeerpoint.com/'
Add-Check -Name 'Member site' -Ok $homeCheck.Ok -Detail $homeCheck.Detail

$staffCheck = Test-Https -Url 'https://mypeerpoint.com/staff' -ContentNeedle 'PEERPoint'
Add-Check -Name 'Staff sign-in (/staff)' -Ok $staffCheck.Ok -Detail $staffCheck.Detail

$adminCheck = Test-Https -Url 'https://admin.mypeerpoint.com/' -ContentNeedle 'PEERPoint'
Add-Check -Name 'Admin site' -Ok $adminCheck.Ok -Detail $adminCheck.Detail

try {
  $ns = @(Resolve-DnsName -Name 'mypeerpoint.com' -Type NS -Server $DnsServer -ErrorAction Stop)
  $hosts = ($ns | Where-Object { $_.NameHost } | ForEach-Object { $_.NameHost.TrimEnd('.').ToLower() })
  $allCf = ($hosts.Count -ge 2) -and ($hosts | ForEach-Object { $_ -like '*.ns.cloudflare.com' } | Where-Object { $_ -eq $false }).Count -eq 0
  Add-Check -Name 'Nameservers (Cloudflare)' -Ok $allCf -Detail $(if ($allCf) { ($hosts -join ', ') } else { "Found: $($hosts -join ', ')" })
} catch {
  Add-Check -Name 'Nameservers (Cloudflare)' -Ok $false -Detail $_.Exception.Message
}

try {
  $mx = @(Resolve-DnsName -Name 'mypeerpoint.com' -Type MX -Server $DnsServer -ErrorAction Stop)
  $mxHosts = ($mx | ForEach-Object { $_.NameExchange.TrimEnd('.').ToLower() })
  $mxOk = ($mxHosts.Count -gt 0) -and (($mxHosts | Where-Object { $_ -like '*.mx.cloudflare.net' }).Count -eq $mxHosts.Count)
  Add-Check -Name 'Email routing (MX)' -Ok $mxOk -Detail $(if ($mxOk) { ($mxHosts -join ', ') } else { "Found: $($mxHosts -join ', ')" })
} catch {
  Add-Check -Name 'Email routing (MX)' -Ok $false -Detail $_.Exception.Message
}

try {
  $txt = @(Resolve-DnsName -Name 'mypeerpoint.com' -Type TXT -Server $DnsServer -ErrorAction Stop)
  $joined = ($txt | ForEach-Object { $_.Strings -join '' }) -join ' '
  $spfOk = $joined -match 'v=spf1' -and $joined -match 'cloudflare'
  Add-Check -Name 'Email SPF (TXT)' -Ok $spfOk -Detail $(if ($spfOk) { 'Expected SPF record found' } else { "Found: $joined" })
} catch {
  Add-Check -Name 'Email SPF (TXT)' -Ok $false -Detail $_.Exception.Message
}

try {
  $a = @(Resolve-DnsName -Name 'mypeerpoint.com' -Type A -Server $DnsServer -ErrorAction Stop)
  $ips = ($a | ForEach-Object { $_.IPAddress }) -join ', '
  $ipOk = $a.Count -gt 0
  Add-Check -Name 'Domain address (apex A)' -Ok $ipOk -Detail $(if ($ipOk) { "Domain resolves to $ips" } else { 'No A records' })
} catch {
  Add-Check -Name 'Domain address (apex A)' -Ok $false -Detail $_.Exception.Message
}

try {
  $wwwA = @(Resolve-DnsName -Name 'www.mypeerpoint.com' -Type A -Server $DnsServer -ErrorAction SilentlyContinue)
  $wwwOk = $wwwA.Count -gt 0
  $wwwIps = ($wwwA | ForEach-Object { $_.IPAddress }) -join ', '
  Add-Check -Name 'WWW connection (A on www)' -Ok $wwwOk -Detail $(if ($wwwOk) { "www resolves to $wwwIps" } else { 'www does not resolve' })
} catch {
  Add-Check -Name 'WWW connection (A on www)' -Ok $false -Detail $_.Exception.Message
}

$failCount = @($results | Where-Object { -not $_.Ok }).Count
$headline = if ($failCount -eq 0) { "$Label`: OK" } else { "$Label`: NEEDS ATTENTION" }

Write-Output $headline
Write-Output ''
foreach ($r in $results) {
  $tag = if ($r.Ok) { 'PASS' } else { 'FAIL' }
  Write-Output (" {0}: {1} - {2}" -f $tag, $r.Name, $r.Detail)
}

if ($Strict -and $failCount -gt 0) {
  exit 1
}
exit 0
