# MSE app — Peer Support Logged Events (SharePoint)

**Site page:** [Peer-Support-Logged-Events.aspx](https://slcounty.sharepoint.com/sites/SH-PS/SitePages/Peer-Support-Logged-Events.aspx)  
**List:** `PeerSupportEvents` on [SH-PS](https://slcounty.sharepoint.com/sites/SH-PS)  
**Source data:** Staff Event Logger on [mypeerpoint.com](https://mypeerpoint.com) → Power Automate → SharePoint

## What the app does

The **MSE (Microsoft SharePoint embedded) app** in `sharepoint/mse-logged-events-app/` is a small HTML/JS UI hosted in **Site Assets**. It reads the **PeerSupportEvents** list using the signed-in user’s SharePoint session (no extra API keys).

**Search filters:**

| Filter | List column |
|--------|-------------|
| Peer supporter | `ProviderDisplayName` |
| Event date (from / to) | `EventDate` / `EventDateValue` |
| Type of peer support | `HelpType` |

## One-time setup

### 1. List and columns

```powershell
cd scripts
.\Create-PeerPointSharePointLists.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
```

Creates or updates **PeerSupportEvents** (including **Event Date (sortable)** `EventDateValue` and indexed search columns).

Restrict the list to **site owners / program admins** (break inheritance) if events are sensitive.

### 2. Upload the MSE app

```powershell
.\Deploy-PeerSupportLoggedEventsApp.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
```

### 3. Wire the site page

1. Open **Peer Support Logged Events** (or create the page at the URL above).
2. **Edit** → add **Embed** web part → URL:
   `https://slcounty.sharepoint.com/sites/SH-PS/SiteAssets/PeerPoint/LoggedEvents/index.html`
3. Add **Power Automate** web part → select flow **PEERPoint — Sync Peer Support Events** (see [peer-support-events-power-automate-flow.md](./peer-support-events-power-automate-flow.md)).
4. **Publish**.

### 4. Cloudflare secret

Set **`PEERPOINT_INTEGRATION_SECRET`** on the Pages project (long random string). Power Automate sends it as:

`Authorization: Bearer <secret>`

## Permissions

- **Read** on `PeerSupportEvents` → can use search UI.
- **Site owner** (or flow runner) → run sync from PEERPoint.

## Updating the UI

Edit files under `sharepoint/mse-logged-events-app/` and re-run `Deploy-PeerSupportLoggedEventsApp.ps1`.
