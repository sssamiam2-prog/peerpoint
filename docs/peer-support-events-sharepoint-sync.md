# Peer Support Event Logger → SharePoint (SH-PS)

Staff record events in the PEERPoint PWA (**Staff → Event Logger**). Site owners on [SH-PS](https://slcounty.sharepoint.com/sites/SH-PS) pull rows into the **PeerSupportEvents** list with Power Automate and a **Refresh PeerPoint** button (e.g. M365 extensibility app + Site Assets for any page scripts; SPFx not required).

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

Map `id` → list column **PeerPoint Event Id** (use as upsert key in the flow).

## App retention (5 days)

- Staff see only their own events from the **last 5 days** in the Event Logger.
- After an event is in SharePoint, Power Automate should **POST** the same integration URL with:

  `{ "importedIds": ["<PeerPoint Event Id>", ...] }`

  That marks rows imported and **removes** them from PEERPoint when they are older than 5 days.
- Events **not** yet marked imported are kept in KV so sync can retry (even past 5 days).

## Power Automate (outline)

1. **Manual trigger** — button on a SharePoint page (“Refresh PeerPoint”), run only as site owner.
2. **HTTP** — GET integration URL with Bearer secret.
3. **Parse JSON** — `events` array.
4. **Apply to each** — **Get items** on PeerSupportEvents where `PeerPointEventId` eq `id`; if none, **Create item**, else **Update item**.
5. **HTTP POST** (same Bearer secret) — body `{ "importedIds": [ ... ids synced this run ... ] }` to mark imported and purge aged rows from the app.

## Admin: types of help

Admins edit the Event Logger dropdown under **Content** → **Peer Support Event — types of help** (one option per line).

## Training phase (member UI hidden)

Set Cloudflare / build env:

`VITE_PEERPOINT_EVENT_LOGGER_PHASE=1`

Staff see Event Logger + Account only. Admin workspace stays full. Remove or set to `0` when member features launch.
