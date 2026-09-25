# Peer Support Event Logger → SharePoint (SH-PS)

Staff record events in the PEERPoint PWA (**Staff → Event Logger**). Site owners on [SH-PS](https://slcounty.sharepoint.com/sites/SH-PS) pull rows into the **PeerSupportEvents** list with Power Automate, then search on the site page:

**[Peer Support Logged Events](https://slcounty.sharepoint.com/sites/SH-PS/SitePages/Peer-Support-Logged-Events.aspx)** — MSE search app (Peer Supporter, date, type of peer support). See [mse-logged-events-app.md](./mse-logged-events-app.md) and [peer-support-events-power-automate-flow.md](./peer-support-events-power-automate-flow.md).

## One-time setup

1. Run `scripts/Create-PeerPointSharePointLists.ps1 -SiteUrl "https://slcounty.sharepoint.com/sites/SH-PS"` (creates **PeerSupportEvents**).
2. Restrict the list to site owners (break inheritance; owners = Full Control).
3. On Cloudflare Pages, set secret **`PEERPOINT_INTEGRATION_SECRET`** (long random string). Power Automate uses this as a Bearer token.

## Integration API

`GET https://mypeerpoint.com/api/integrations/peer-support-events`

Headers:

- `Authorization: Bearer <PEERPOINT_INTEGRATION_SECRET>`

Query (optional):

| Param | Purpose |
|--------|---------|
| `since` | ISO timestamp — only events recorded on or after this time |
| `limit` | Max rows (default 2000) |
| `pendingOnly=1` | Rows without `sharePointImportedAt` (reserved for future marking) |

Response: `{ exportedAt, count, events: [{ id, eventDate, prpsBureau, prpsGender, helpType, providerDisplayName, totalMinutes, ... }] }`

Map `id` → list column **PeerPoint Event Id** (use as upsert key in the flow). Also set **Event Date (sortable)** (`EventDateValue`) from `eventDate` for views and the MSE app sort order.

## App retention (5 days)

- Staff see only their own events from the **last 5 days** in the Event Logger.
- After an event is in SharePoint, Power Automate should **POST** the same integration URL with:

  `{ "importedIds": ["<PeerPoint Event Id>", ...] }`

  That marks rows imported and **removes** them from PEERPoint when they are older than 5 days.
- Events **not** yet marked imported are kept in KV so sync can retry (even past 5 days).

## Power Automate

Full step-by-step: **[peer-support-events-power-automate-flow.md](./peer-support-events-power-automate-flow.md)** (GET pending events → upsert list → POST `importedIds`).

## Admin: types of help

Admins edit the Event Logger dropdown under **Help types** tab (one option per line).

## Training phase (member UI hidden)

Set Cloudflare / build env:

`VITE_PEERPOINT_EVENT_LOGGER_PHASE=1`

Staff see Event Logger + Account only. Admin workspace stays full. Remove or set to `0` when member features launch.
