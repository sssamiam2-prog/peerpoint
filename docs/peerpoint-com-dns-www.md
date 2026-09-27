# peerpoint.com — fix “www connection” monitor

**SLCO PEERPoint does not use peerpoint.com.** Use [mypeerpoint-monitoring.md](./mypeerpoint-monitoring.md) instead.

**Not the same as** [mypeerpoint.com](https://mypeerpoint.com) (SLCO PEERPoint PWA on Cloudflare).

## Failure

```text
FAIL: Peerpoint www connection — Missing: webproduction-allenovery03.thirtythreelive.co.uk.;
      found: pepojobs1701.thirtythreelive.co.uk.
```

## Cause

`www.peerpoint.com` is a **CNAME** to `pepojobs1701.thirtythreelive.co.uk`. That host then CNAMEs again to `webproduction-allenovery03.thirtythreelive.co.uk`, so the website can still return **HTTP 200**. Many monitors only inspect the **first** CNAME on `www` and expect:

| Host | Type | Value |
|------|------|--------|
| `www` | CNAME | `webproduction-allenovery03.thirtythreelive.co.uk` |

## Where to change it

- **Nameservers:** `ns1-35.azure-dns.com` … `ns4-35.azure-dns.info` → **Azure DNS** zone `peerpoint.com`
- **Not** in the SLCO Cloudflare account used for `mypeerpoint.com`

### Azure Portal (whoever owns the zone)

1. **DNS zones** → **peerpoint.com**
2. Open record set **www** (type CNAME)
3. Set alias to **`webproduction-allenovery03.thirtythreelive.co.uk`** (no `https://`, trailing dot optional)
4. Save. TTL was 21600 (6h); consider **3600** while verifying, then raise again if needed.

### Azure CLI

From repo root, after `az login` to the tenant that owns the zone:

```powershell
.\scripts\Fix-PeerpointCom-WwwCname.ps1 -ResourceGroupName "<resource-group-with-zone>"
```

## Verify

```powershell
Resolve-DnsName www.peerpoint.com -Type CNAME -Server 8.8.8.8
# NameHost should be: webproduction-allenovery03.thirtythreelive.co.uk
```

Re-run your domain monitor after DNS propagates (up to previous TTL, often a few hours).

## If you do not have Azure access

Ask **Thirty Three Live** / whoever hosts `*.thirtythreelive.co.uk` to confirm the correct www target and either:

- update the **peerpoint.com** Azure DNS `www` record, or  
- tell you the resource group / subscription so SLCO can run the script above.
