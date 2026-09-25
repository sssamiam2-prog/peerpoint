# PEERPoint (local workspace)

This folder is your **local home** for PEERPoint source, docs, and architecture notes while working in Cursor.

## Quick links

- **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Run the app:** `cd apps/pwa` → `npm install` → `npm run dev`
- **Deploy:** `cd apps/pwa` → `npm run deploy:pages`
- **Production:** [mypeerpoint.com](https://mypeerpoint.com) · [admin.mypeerpoint.com](https://admin.mypeerpoint.com)
- **GitHub:** [sssamiam2-prog/peerpoint](https://github.com/sssamiam2-prog/peerpoint)

## Folder contents

| Item | Description |
|------|-------------|
| `apps/pwa/` | React PWA + Cloudflare Functions (main product) |
| `docs/` | Operational and integration documentation |
| `scripts/` | SharePoint setup, generators, smoke tests |
| `peer-support-app/` | Legacy SPFx (optional future embed) |
| `ARCHITECTURE.md` | System design, APIs, hosts, training phase |

## Git and sync

A full copy of the project (excluding `node_modules`, `dist`, `.git`) lives here. The **git repository** may still be checked out at:

`Desktop\Apps I Built\SPFx Project\Peer Support App`

After editing in either location, keep them aligned:

```powershell
.\scripts\sync-from-spfx-repo.ps1
```

Or copy changes back to the SPFx folder before `git commit` / `git push` if that is still your remote-connected clone.

## Docs index

See [docs/dev-and-preview.md](./docs/dev-and-preview.md) for CI, Cloudflare, and domains.
