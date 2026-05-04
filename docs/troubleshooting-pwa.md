# PEERPoint PWA — troubleshooting

Use this when local or deployed behavior does not match expectations. **Never paste API keys, tokens, or secrets** into issues or chat.

## Quick checks

| Check | Command / action |
|--------|-------------------|
| Install deps | `cd apps/pwa` then `npm install` |
| Production build | `npm run build` (catches TypeScript and Vite errors) |
| Dev server | `npm run dev` — Vite prints the local URL (default port **5173**) |
| Env loaded? | Vite reads `.env` only at **startup** — restart after editing `VITE_*` variables |

## Environment variables

- **`VITE_ABLY_KEY`** — required for **Peer chat** (`/chat`). Copy the full key from the Ably dashboard (format like `appId.keyId:secret`, one line). See `apps/pwa/.env.example`.
- **`apps/pwa/.env`** is **gitignored**; use `.env.example` as a template. To sync from a key file at the repo root, you can use `scripts/sync-ably-env.ps1`.

## Peer chat (Ably)

- **Channel names** in code are `peerpoint:room:{ROOMCODE}` (normalized uppercase alphanumeric room codes).
- **API key capabilities** for that channel pattern must include at least **publish**, **subscribe**, **history** (app loads history on join), and **presence** if you want the “people in this room” roster.
- **Isolate key vs app issues:** temporarily use an unrestricted “root” Ably key in `.env`; if chat works, tighten capabilities again on a restricted key.

### Browser console (development)

Filter dev logs:

- **`[PeerChat]`** — Ably session (connect, publish, receive, presence).
- **`[PeerChat UI]`** — React UI (join, send, message append).

If sends fail, expand the error under the Send button and note the message text **without** secrets.

## Service worker / stale UI

With **`vite-plugin-pwa`**, dev mode may write under `apps/pwa/dev-dist/` (ignored by git). If the app behaves oddly after changes:

- Hard refresh (**Ctrl+Shift+R**) or clear site data for `localhost`.
- Restart **`npm run dev`**.

## Git and tracking source

- **`apps/pwa/src/lib/`** holds shared helpers (e.g. Ably peer chat). It must **not** be ignored by a blanket `lib/` rule; the repo `.gitignore` scopes build-output `lib` folders instead.
- **`Peer Support App.code-workspace`** — optional; commit only if the team shares one Cursor/VS Code workspace file.

## Deploy (Cloudflare Pages)

See [dev-and-preview.md](./dev-and-preview.md) for Actions secrets, build command, and output directory (`dist`).

## Still stuck?

Capture **steps to reproduce**, **browser + OS**, whether **localhost vs deployed**, and **exact error text** from the UI or console (redact URLs/tokens). Optionally attach output of `npm run build` from `apps/pwa`.
