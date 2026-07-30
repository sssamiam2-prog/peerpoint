# PEERPoint PWA: GitHub Actions + Cloudflare Pages

**Administrator / staff how-to:** see [admin-user-manual.md](./admin-user-manual.md).

**Hosts:** members + staff → `https://mypeerpoint.com`; Admin login only → `https://admin.mypeerpoint.com` (same Pages project; add custom domain + CNAME).

**Troubleshooting:** see [troubleshooting-pwa.md](./troubleshooting-pwa.md) (Ably chat, env, build, service worker).

**Product track:** standalone **PWA** in `apps/pwa` — **no Microsoft sign-in, Graph, or SharePoint** in the app. Requests are stored **only in the browser** (see Request Help); Self Help uses built-in articles.

**CI/hosting:** **GitHub Actions** + **Cloudflare Pages** (see workflow below).

The **`peer-support-app`** folder is an older **SPFx** solution kept in the repo for reference or a future SharePoint embed; it is **not** required to run or deploy the PWA.

## Day-to-day development (local)

```bash
cd apps/pwa
npm install
npm run dev
```

## Primary: deploy PWA with GitHub + Cloudflare

Workflow: [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml) — on push to `main` (paths under `apps/pwa/` or the workflow file), or **workflow_dispatch**, it runs `npm ci` + `npm run build` in `apps/pwa`, then `wrangler pages deploy`.

### One-time: Cloudflare

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** — create project **`peer-support-pwa`** (or change the name in the workflow, [`apps/pwa/wrangler.toml`](../apps/pwa/wrangler.toml), and [`apps/pwa/package.json`](../apps/pwa/package.json) `deploy:pages` script).
2. Create an **API Token** with **Cloudflare Pages — Edit**. Copy **Account ID** from the Workers & Pages overview.

### One-time: GitHub Actions secrets

In the **GitHub** repo: **Settings → Secrets and variables → Actions**

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | API token from Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Cloudflare dashboard |
| `VITE_ABLY_KEY` | *(optional but recommended)* Your Ably API key so **Peer chat** and **Peer voice** work on the live site (same key as local `.env`). |

Pushes to `main` that touch `apps/pwa/` or the workflow file trigger **Deploy PWA to Cloudflare Pages**. You can also run it from the **Actions** tab.

After the first successful deploy, Cloudflare shows the production URL, typically:

`https://peer-support-pwa.pages.dev`

**Canonical public URL:** [https://mypeerpoint.com](https://mypeerpoint.com) (custom domain on the same Pages project — see below).

---

## Custom domain: `mypeerpoint.com` (Cloudflare Registrar)

Because the domain was purchased through Cloudflare, DNS already lives in your account. Attach it to the Pages app:

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → project **`peer-support-pwa`**.
2. Open **Custom domains** → **Set up a domain**.
3. Enter **`mypeerpoint.com`** (and optionally **`www.mypeerpoint.com`** as a second domain or redirect).
4. Confirm. Cloudflare will create/update the DNS records that point the zone at Pages and issue HTTPS automatically.
5. Wait until status is **Active**, then open **https://mypeerpoint.com** and confirm the PWA loads.

Optional but recommended:

- **www → apex:** In the zone’s **Rules** (or Pages custom domain settings), redirect `www.mypeerpoint.com` → `https://mypeerpoint.com` so one origin is canonical.
- **Short.io:** If you still use `slco.to/peerpoint`, set its destination to `https://mypeerpoint.com/` (not `*.pages.dev`).

Production Ably token auth (`VITE_ABLY_AUTH_URL=/api/ably-token`) and Pages Function secrets (`ABLY_API_KEY`, `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, etc.) apply to this domain the same as `*.pages.dev`.

Twilio SMS secrets: from `apps/pwa` run `.\scripts\set-twilio-secrets.ps1` (see [troubleshooting-pwa.md](./troubleshooting-pwa.md#sms-twilioorg)).

---

## Short link: `https://slco.to/peerpoint` → Cloudflare Pages

Use **Short.io** only as a **redirect** to your real HTTPS URL. The PWA runs on Cloudflare; the short link is for posters and SMS.

### A. Confirm Cloudflare Pages is live

1. Complete **Cloudflare Pages project** + **GitHub secrets** above and run the deploy workflow once.
2. Open **https://mypeerpoint.com** (or **Pages → peer-support-pwa → Visit site** while the custom domain is pending) and confirm the app loads over **HTTPS**.
3. Canonical site URL: **`https://mypeerpoint.com/`**.

### B. Short.io — create `slco.to/peerpoint`

1. Sign in at [Short.io](https://short.io/) (or your organization’s Short.io workspace).
2. Ensure the branded domain **`slco.to`** is added and **DNS is verified** per Short.io’s instructions (usually **CNAME** records at your DNS host pointing at Short.io). Skip this step only if `slco.to` is already active there.
3. **Create a link:**
   - **Path:** `peerpoint` (full short URL: `https://slco.to/peerpoint`).
   - **Destination URL:** `https://mypeerpoint.com/` (include `https://`).
   - Use a normal **301 or 302** redirect (Short.io default is fine).
4. Test in a private window: `https://slco.to/peerpoint` → should land on **mypeerpoint.com**.

### C. Ably on production builds

If **`VITE_ABLY_KEY`** / token auth is missing from GitHub Actions secrets and Pages Function secrets, the deployed app will load but chat/voice will ask for configuration. Add the secrets and redeploy.

---

### Git repository layout

- **GitHub** (for Actions + Pages): **https://github.com/sssamiam2-prog/peerpoint** — add `git remote add github https://github.com/sssamiam2-prog/peerpoint.git` if you clone without it (remote name `github`).
- **Azure DevOps** may still be used as an extra remote for org policy (`origin`). After local commits, push to both as needed, e.g. `git push origin main` and `git push github main`.

### Push workflows to GitHub (`workflow` OAuth scope)

If `git push github main` fails when updating `.github/workflows/*.yml`, the GitHub credential needs the **`workflow`** scope:

```bash
gh auth refresh -s workflow -h github.com
```

Then `git push github main` again.

### Local deploy to Pages (no GitHub)

From `apps/pwa`, set a **Cloudflare API token** in your shell (do not commit it), with **Account → Cloudflare Pages → Edit**, then:

**Windows (PowerShell):**

```powershell
$env:CLOUDFLARE_API_TOKEN = "<your-api-token>"
.\scripts\deploy-pages.ps1
```

**Any OS:**

```bash
export CLOUDFLARE_API_TOKEN="<your-api-token>"   # Windows PowerShell: $env:CLOUDFLARE_API_TOKEN="..."
cd apps/pwa
npm run deploy:pages
```

`npm run deploy:pages` runs `npm run build` then `npx wrangler pages deploy dist --project-name=peer-support-pwa`. The first successful upload **creates** the `peer-support-pwa` project if it does not exist. Your app URL will look like `https://peer-support-pwa.pages.dev` (check the command output and **Workers & Pages** in the dashboard).

### Cloudflare “Connect Git” instead of Actions

If you prefer Cloudflare to run the build (no GitHub Action):

- **Root directory:** `apps/pwa`
- **Build command:** `npm ci && npm run build` (`apps/pwa/.npmrc` enables `npm ci` with Vite 8 + `vite-plugin-pwa`.)
- **Build output directory:** `dist`
- **Environment variables (production):** add **`VITE_ABLY_KEY`** with the same value you use locally so chat/voice work when Cloudflare builds the app.

### `staticwebapp.config.json`

[`apps/pwa/public/staticwebapp.config.json`](../apps/pwa/public/staticwebapp.config.json) is harmless on Cloudflare; it is only used if you ever deploy the same `dist` to Azure Static Web Apps again.

## SPA behavior on Pages

Cloudflare Pages treats the app as an SPA when there is **no** top-level `404.html`. Do not add a root `404.html` unless you intend to change that behavior.
