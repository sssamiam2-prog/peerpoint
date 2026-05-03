# SharePoint Lists (MVP schema)

This app uses **SharePoint lists** as the database layer (not Cloudflare D1 or other external SQL). The PWA talks to these lists through **Microsoft Graph** using IDs in `apps/pwa/.env`; the SPFx web part uses the same lists by **list title** via REST.

**Automated provisioning:** run [`scripts/Create-PeerPointSharePointLists.ps1`](../scripts/Create-PeerPointSharePointLists.ps1) from PowerShell (see script help). You must supply your **SharePoint site URL** and sign in as someone who can create lists.

These lists live in the SharePoint site hosting the SPFx web part.

## Entra ID groups → roles

- **Admins**: `PeerSupport_Admins`
- **HR**: `PeerSupport_HR`
- **Peer Supporters**: `PeerSupport_PeerSupporters`

## List: `PeerSupportRequests`

Purpose: intake + assignment workflow + per-field visibility flags (Option A).

Recommended list settings:
- **Content approval**: Off
- **Attachments**: Off (keep request data structured)
- **Item-level permissions**: set at runtime (break inheritance per item on assignment)

Columns (in addition to default `Title`, `Created`, `Author`, etc.):
- **RequesterName** (Single line of text, optional)
- **RequesterPhone** (Single line of text, required)
- **RequesterEmail** (Single line of text, required)
- **PreferredContact** (Multiple lines of text, optional)
- **Description** (Multiple lines of text, optional)
- **ConsentAcknowledged** (Yes/No, required, default No)
- **Status** (Choice, required): `New`, `Assigned`, `InProgress`, `Closed`
- **AssignedPeerSupporter** (Person or Group, optional)

Visibility flags (Yes/No, required, defaults recommended):
- **ShowNameToPeer** (default Yes)
- **ShowPhoneToPeer** (default Yes)
- **ShowEmailToPeer** (default Yes)
- **ShowPreferredContactToPeer** (default Yes)
- **ShowDescriptionToPeer** (default Yes)

## List: `SelfHelpContent`

Purpose: self-help articles/links surfaced in the Self Help page.

The SPFx web part also ships **built-in articles** (sworn LE and agency-staff topics such as cumulative stress, critical incidents, vicarious trauma for civilians, shift work, 988/SAMHSA links). Those always appear and are **merged** with published list items, sorted by `SortOrder` then `Title`. Use the list to add agency-specific guidance without losing the defaults.

If this list **does not exist** on the site yet, Self Help still shows the built-in articles and a warning banner—no error. Create the list when you are ready to publish agency content.

### Create `SelfHelpContent` (site owner)

1. Open the SharePoint site (e.g. **SH-PSB**): **Site contents** → **New** → **List**.
2. Name the list exactly: **`SelfHelpContent`** (internal name will match if you avoid renaming later).
3. Add columns (List settings → Create column), in addition to **Title**:
   - **Body** — Multiple lines of text (plain or Enhanced rich text, as you prefer).
   - **Url** — Hyperlink (optional).
   - **Category** — Single line of text (optional).
   - **SortOrder** — Number (optional; lower sorts first).
   - **IsPublished** — Yes/No, default **No**; set to **Yes** on items you want visible in the app.
4. Grant site members **Contribute** (or your chosen permission) if they should author content; readers only need **Read** to view published items.
5. Refresh the PEERPoint web part → **Self Help** → **Refresh**.

Columns:
- **Title** (default)
- **Body** (Multiple lines of text, enhanced rich text recommended)
- **Url** (Hyperlink or Picture, optional)
- **Category** (Single line of text, optional)
- **SortOrder** (Number, optional)
- **IsPublished** (Yes/No, required, default No)

## List: `AuditLog`

Purpose: track key actions for compliance and investigation.

Columns:
- **EventType** (Choice, required): `RequestCreated`, `RequestAssigned`, `RequestVisibilityChanged`, `RequestStatusChanged`, `RequestViewed`, `SelfHelpViewed`
- **RequestId** (Number, optional)
- **DetailsJson** (Multiple lines of text, plain text)

Notes:
- This list should be readable by Admin/HR only.
- Avoid writing sensitive request field values into `DetailsJson`; keep it metadata-oriented.

