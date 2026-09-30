# Monitoring mypeerpoint.com (not peerpoint.com)

SLCO **PEERPoint** runs at **https://mypeerpoint.com** and **https://admin.mypeerpoint.com** on Cloudflare Pages.

**peerpoint.com** is a different organization’s domain (Allen & Overy / Thirty Three Live). Alerts for `peerpoint.com`, `134.213.15.91`, or `thirtythreelive.co.uk` are **not** for your PWA — remove or disable that monitor.

## Daily Gmail alert (Google Apps Script)

The **“Daily Website Monitor”** messages (from **sssamiam2@gmail.com**, ~8:35 AM MDT) come from this project:

- **Name:** Rosie Website and Email Monitor  
- **Editor:** [script.google.com – project edit](https://script.google.com/home/projects/1kOZZvRZV0KL8at1whEziHUaQ1p2bE8GCAGi37Sd24KNLKfwrQbwHlHGz/edit)  
- **Function:** `dailyMonitor` (time trigger 8:00 AM America/Denver)

The `SITES` array in **Code.gs** should use **mypeerpoint.com** (Cloudflare), not **peerpoint.com** (Allen & Overy / Azure DNS). The PEERPoint entry checks `https://mypeerpoint.com/` for **PEERPoint** text plus NS/MX/SPF like the other Cloudflare sites (no fixed www CNAME or Allen & Overy IP).

To test after edits: select **dailyMonitor** → **Run** (authorizes `MailApp` / `UrlFetchApp` if prompted).

## Find old peerpoint.com alerts in Gmail

```text
"NEEDS ATTENTION" peerpoint
```

Those failures were from the removed **peerpoint.com** block (wrong domain for SLCO). New reports should say **PEERPoint (SLCO) (mypeerpoint.com)**.

## What to monitor for PEERPoint

| Check | URL or target | Notes |
|--------|----------------|--------|
| Member PWA | `https://mypeerpoint.com/` | HTTP **200**, page contains **PEERPoint** |
| Staff sign-in | `https://mypeerpoint.com/staff` | HTTP **200** |
| Admin host | `https://admin.mypeerpoint.com/` | HTTP **200** |
| DNS | `mypeerpoint.com` | NS: `*.ns.cloudflare.com` |
| Email (if used) | `mypeerpoint.com` MX | Cloudflare Email Routing: `route*.mx.cloudflare.net` |
| SPF | TXT on `mypeerpoint.com` | Contains `v=spf1` and `_spf.mx.cloudflare.net` |
| www | `www.mypeerpoint.com` | Should resolve (A/AAAA via Cloudflare); optional redirect to apex |

Do **not** expect CNAME to `thirtythreelive.co.uk` or apex IP **134.213.15.91**.

## In this repo

### PowerShell (local or Task Scheduler)

```powershell
cd "C:\Users\obxbu\Desktop\Apps I Built\PeerPoint\scripts"
.\Monitor-MypeerpointHealth.ps1
.\Monitor-MypeerpointHealth.ps1 -Strict   # exit code 1 if any FAIL
```

Schedule in **Task Scheduler** to run daily; use “Send email” action or your org’s alerting if you want Gmail notifications.

### GitHub Actions

Workflow **Mypeerpoint health** (`.github/workflows/mypeerpoint-health.yml`) runs on a schedule and on demand. Enable **Watch → Custom → Actions** on the GitHub repo to get email when a run fails.

## Quick manual test

```powershell
Invoke-WebRequest https://mypeerpoint.com/ -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://mypeerpoint.com/staff -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest https://admin.mypeerpoint.com/ -UseBasicParsing | Select-Object StatusCode
```

All should be **200**.
