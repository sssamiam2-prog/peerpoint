# Security hardening checklist (MVP)

This document captures the operational steps to secure the SharePoint Lists backend and the SPFx/PWA client behavior.

## SharePoint Lists permissions (recommended)

### `PeerSupportRequests`
- **Write**: Everyone in the Sheriff’s Office site who should be allowed to request help.\n- **Read**: Admin/HR by default.\n- **Item-level**: on assignment, the app breaks inheritance and grants:\n  - Admin group: **Contribute**\n  - HR group: **Contribute**\n  - Assigned Peer Supporter: **Read** (only for that item)\n\nImportant: the permission automation expects **SharePoint site groups** named:\n- `PeerSupport_Admins`\n- `PeerSupport_HR`\n\nThese groups can contain Entra security groups (recommended) or individual users.

### `SelfHelpContent`
- **Read**: Everyone (internal).\n- **Write**: Admin/HR (or a content curator subgroup).\n- **Publishing**: Use `IsPublished` to control what is visible.

### `AuditLog`
- **Write**: the app/web part.\n- **Read**: Admin/HR only.\n- Do **not** store request narratives or contact details in `DetailsJson`.

## Data minimization
- The app **does not** log request phone/email/description.\n- Audit events are metadata-only (event type, request id, and safe fields like visibility flags).

## Operational recommendations
- Keep the **GitHub repository private** (see [repo-visibility.md](./repo-visibility.md)). Public source previously exposed seed admin passwords in git history.
- Set Cloudflare Pages secrets `SEED_ADMIN_PASSWORD` and `SEED_GLOBAL_ADMIN_PASSWORD` for bootstrap only; rotate live admin passwords in the app after any exposure.
- Turn on **M365 Purview** retention policies for lists as required by policy.
- Maintain an incident response process for accidental access changes.
- Periodically review group membership for `PeerSupport_Admins`, `PeerSupport_HR`, and `PeerSupport_PeerSupporters`.

