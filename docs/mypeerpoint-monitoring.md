# Monitoring mypeerpoint.com (not peerpoint.com)

SLCO **PEERPoint** runs at **https://mypeerpoint.com** and **https://admin.mypeerpoint.com** on Cloudflare Pages.

**peerpoint.com** is a different organization’s domain (Allen & Overy / Thirty Three Live). Alerts for `peerpoint.com`, `134.213.15.91`, or `thirtythreelive.co.uk` are **not** for your PWA — remove or disable that monitor.

## Find your current Gmail monitor

In Gmail search (adjust the date range if needed):

```text
"NEEDS ATTENTION" peerpoint
```

Also try:

```text
"Expected NS record" OR "www connection" OR "Peerpoint (peerpoint.com)"
```

Open a matching message and note the **From** address and any **footer link** (UptimeRobot, Site24x7, Domain Scan, AlertSite, WarpCheck, a Google Apps Script “Domain Monitor”, etc.). Sign in to that service and:

1. **Delete** or **pause** monitors for **peerpoint.com** / **www.peerpoint.com**.
2. **Add** monitors for the URLs below (or rely on GitHub Actions + the PowerShell script in this repo).

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
