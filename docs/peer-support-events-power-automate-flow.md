# Power Automate — Sync Peer Support Events to SharePoint

Flow name (recommended): **PEERPoint — Sync Peer Support Events**

**Trigger:** Manually trigger a cloud flow (button on the [Logged Events page](./mse-logged-events-app.md))

**Environment:** Salt Lake County GCC (same tenant as SH-PS)

---

## Prerequisites

| Item | Value |
|------|--------|
| SharePoint site | `https://slcounty.sharepoint.com/sites/SH-PS` |
| List | `PeerSupportEvents` |
| GET URL | `https://mypeerpoint.com/api/integrations/peer-support-events?pendingOnly=1` |
| POST URL | `https://mypeerpoint.com/api/integrations/peer-support-events` |
| Auth header | `Authorization: Bearer <PEERPOINT_INTEGRATION_SECRET>` |

Provision list columns: `scripts/Create-PeerPointSharePointLists.ps1`

---

## Flow steps (build in Power Automate)

### 1. Trigger

- **Manually trigger a cloud flow**
- Only **site owners** should have permission to run it (share the flow or use a service account).

### 2. HTTP — GET events from PEERPoint

- **Method:** GET  
- **URI:** `https://mypeerpoint.com/api/integrations/peer-support-events?pendingOnly=1&limit=2000`  
- **Headers:**  
  - `Authorization` = `Bearer <your PEERPOINT_INTEGRATION_SECRET>`

### 3. Parse JSON

**Content:** Body from HTTP GET  
**Schema (sample):**

```json
{
  "type": "object",
  "properties": {
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "eventDate": { "type": "string" },
          "recordedAt": { "type": "string" },
          "prpsBureau": { "type": "string" },
          "prpsGender": { "type": "string" },
          "workRelatedIncident": { "type": "string" },
          "helpType": { "type": "string" },
          "providerDisplayName": { "type": "string" },
          "providerUsername": { "type": "string" },
          "totalMinutes": { "type": "number" },
          "createdByDisplay": { "type": "string" }
        }
      }
    }
  }
}
```

### 4. Initialize variable

- **Name:** `syncedIds`  
- **Type:** Array  
- **Value:** `[]`

### 5. Apply to each — `events`

For each event `item`:

#### 5a. Get items (SharePoint)

- **Site Address:** SH-PS  
- **List Name:** PeerSupportEvents  
- **Filter Query:** `PeerPointEventId eq '@{items('Apply_to_each')?['id']}'`  
- **Top Count:** 1  

(Use the correct “Apply to each” name Power Automate assigns.)

#### 5b. Condition — item exists?

`length(body('Get_items')?['value'])` is equal to `0`

**If yes (create):**

- **Create item** — map fields:

| SharePoint column | Power Automate value |
|-------------------|----------------------|
| Title | `@{concat(items('Apply_to_each')?['providerDisplayName'], ' — ', items('Apply_to_each')?['eventDate'])}` |
| PeerPointEventId | `@{items('Apply_to_each')?['id']}` |
| EventDate | `@{items('Apply_to_each')?['eventDate']}` |
| EventDateValue | `@{items('Apply_to_each')?['eventDate']}` (date only) |
| RecordedAt | `@{items('Apply_to_each')?['recordedAt']}` |
| PrpsBureau | `@{items('Apply_to_each')?['prpsBureau']}` |
| PrpsGender | `@{items('Apply_to_each')?['prpsGender']}` |
| WorkRelatedIncident | `@{items('Apply_to_each')?['workRelatedIncident']}` |
| HelpType | `@{items('Apply_to_each')?['helpType']}` |
| ProviderDisplayName | `@{items('Apply_to_each')?['providerDisplayName']}` |
| ProviderUsername | `@{items('Apply_to_each')?['providerUsername']}` |
| TotalMinutes | `@{items('Apply_to_each')?['totalMinutes']}` |
| CreatedByDisplay | `@{items('Apply_to_each')?['createdByDisplay']}` |

**If no (update):**

- **Update item** — same field map, **Id** = `first(body('Get_items')?['value'])?['ID']`

#### 5c. Append to array

- **Append to array variable** `syncedIds`  
- **Value:** `@{items('Apply_to_each')?['id']}`

### 6. Condition — any synced?

`length(variables('syncedIds'))` is greater than `0`

**If yes:**

- **HTTP POST**  
  - **URI:** `https://mypeerpoint.com/api/integrations/peer-support-events`  
  - **Headers:** same Bearer secret  
  - **Body:**

```json
{
  "importedIds": @{variables('syncedIds')}
}
```

(Use **Compose** + dynamic content for `importedIds` if the designer requires valid JSON.)

This marks rows imported in PEERPoint and purges aged copies from the app (5-day staff retention).

---

## Add the button to the page

1. Save and turn on the flow.  
2. On [Peer-Support-Logged-Events.aspx](https://slcounty.sharepoint.com/sites/SH-PS/SitePages/Peer-Support-Logged-Events.aspx), add the **Power Automate** web part and pin this flow.  
3. Users click **Sync from PEERPoint**, wait for success, then **Reload list** in the embedded search app.

---

## Optional: scheduled sync

Duplicate the flow with a **Recurrence** trigger (e.g. every 15 minutes) instead of manual — still use `pendingOnly=1` on GET.

---

## Troubleshooting

| Issue | Check |
|-------|--------|
| HTTP 401 | Secret mismatch; no leading/trailing spaces in Bearer token |
| HTTP 503 | `PEERPOINT_INTEGRATION_SECRET` not set on Cloudflare Pages |
| Empty `events` | No pending rows in PEERPoint, or all already marked imported |
| Create item fails | Re-run list script; verify internal column names match |
| Embed app “context not found” | Embed URL must be same SH-PS site; not a external iframe domain |

See also [peer-support-events-sharepoint-sync.md](./peer-support-events-sharepoint-sync.md).
