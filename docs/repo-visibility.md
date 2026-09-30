# GitHub repository visibility

## Current status

The GitHub repo [`sssamiam2-prog/peerpoint`](https://github.com/sssamiam2-prog/peerpoint) has been **public**. Anyone on the internet can browse source, history, and docs.

The live apps (`mypeerpoint.com`, `admin.mypeerpoint.com`) are separate from GitHub visibility — they stay reachable on the public web as designed. Making the **repo** private does **not** take the websites down.

## Why this matters

PEERPoint is an internal peer-support product. Public source has included:

- Full application and Cloudflare Functions code
- Hardcoded seed admin password values (removed from current source; still present in **git history** until the repo is private or history is rewritten)
- Operational docs (SharePoint, Twilio, Resend, CI secrets *names*)

Cloudflare Pages secrets, Ably keys, and KV data are **not** in git when `.env` / tokens stay gitignored — but seed passwords that lived in source were visible to anyone.

## Make the repository private (recommended)

You must do this in GitHub (agents cannot change visibility):

1. Open **https://github.com/sssamiam2-prog/peerpoint/settings**
2. Scroll to **Danger Zone** → **Change repository visibility** → **Make private**
3. Confirm

After it is private, only collaborators you invite can see the code.

### Collaborators / CI

- Invite teammates under **Settings → Collaborators**
- GitHub Actions and Cloudflare deploys keep working; secrets stay in **Settings → Secrets and variables → Actions** and Cloudflare Pages

## Rotate credentials after public exposure

Even after the repo is private, treat previously committed seed passwords as **compromised**:

1. Sign in to **https://admin.mypeerpoint.com** and change passwords for `admin` and `admn` (or reset via Admin → Members / change-password flows).
2. In Cloudflare Pages → project **`peer-support-pwa`** → **Settings → Environment variables (Functions secrets)**, set:
   - `SEED_ADMIN_PASSWORD` — used only when creating a missing `admin` account
   - `SEED_GLOBAL_ADMIN_PASSWORD` — used only when creating a missing `admn` account
3. Prefer strong unique values. New seed accounts require a password change on first login.
4. Redeploy is not required for secrets alone; new deploys pick them up for Functions.

Existing accounts in `PEERPOINT_KV` are **not** overwritten by seed secrets — rotating means changing the live passwords in the app.

## Local / smoke scripts

Do not put real passwords in the repo. For local Functions (`wrangler pages dev`), use a gitignored `.dev.vars` in `apps/pwa/`:

```
SEED_ADMIN_PASSWORD=...
SEED_GLOBAL_ADMIN_PASSWORD=...
```

Smoke / training capture scripts read:

- `SEED_ADMIN_PASSWORD` or `PEERPOINT_ADMIN_PASSWORD`
- `PEERPOINT_STAFF_EMAIL`
- `PEERPOINT_STAFF_TEMP`
- `PEERPOINT_STAFF_NEW_PW`

## Optional: scrub git history

Making the repo private is the primary control. Rewriting history (`git filter-repo`) is optional and disruptive; only do it if you need the old commits gone from every clone. After a rewrite, force-push and ask collaborators to re-clone.
