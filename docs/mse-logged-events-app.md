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

### 2. Upload the MSE app and embed on the site page

Requires **PowerShell 7** (`pwsh`). Sign in with your **SLCO** account when the browser opens.

```powershell
cd scripts
.\Deploy-PeerSupportLoggedEventsApp.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
```

Or double-click **`Deploy-PeerSupportLoggedEventsApp.cmd`**.

The script uploads `index.html`, `app.css`, and `app.js` to  
`SiteAssets/PeerPoint/LoggedEvents/`, then wires the **Peer-Support-Logged-Events** page with **inline** markup (body + links to `app.css` / `app.js`).

**Do not** open or iframe `index.html` from Site Assets — SharePoint Online treats library HTML as a **download**, not a page.

**Fix (Modern Script Editor on the site page):**

1. **Edit** the page → select the Script Editor web part → **Edit markup**.
2. Replace all HTML with the contents of `sharepoint/mse-logged-events-app/mse-inline.generated.html` (regenerate with `scripts/Export-MseInlineSnippet.ps1 -AssetBaseUrl "https://…/SiteAssets/PeerPoint/LoggedEvents" -OutFile …`).
3. Leave **Enable classic _spPageContextInfo** on → **Save** the markup, then **Save** / republish the page.

The generated snippet **inlines CSS and JavaScript** — Modern Script Editor strips external `<link>` / `<script src>` tags, so linked Site Assets styles/scripts will not apply.

### List missing or empty

The UI reads **`PeerSupportEvents`** on SH-PS. If the list does not exist yet:

```powershell
cd scripts
.\Create-PeerPointSharePointLists.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"
```

Then run the **PEERPoint — Sync Peer Support Events** Power Automate flow (see [peer-support-events-power-automate-flow.md](./peer-support-events-power-automate-flow.md)).

Use `-SkipPageWire` to upload files only. GCC tenants may need a one-time Entra app for PnP; set `PEERPOINT_PNP_CLIENT_ID` if IT gave you one.

### 3. Optional — Power Automate on the same page

**Edit** the page → add **Power Automate** → flow **PEERPoint — Sync Peer Support Events** (see [peer-support-events-power-automate-flow.md](./peer-support-events-power-automate-flow.md)) → **Publish**.

### 4. Cloudflare secret

Set **`PEERPOINT_INTEGRATION_SECRET`** on the Pages project (long random string). Power Automate sends it as:

`Authorization: Bearer <secret>`

## Permissions

- **Read** on `PeerSupportEvents` → can use search UI.
- **Site owner** (or flow runner) → run sync from PEERPoint.

## Updating the UI

Edit files under `sharepoint/mse-logged-events-app/` and re-run `Deploy-PeerSupportLoggedEventsApp.ps1`.
