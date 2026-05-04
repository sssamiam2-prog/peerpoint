# PEERPoint PWA: GitHub Actions + Cloudflare Pages

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

Workflow: [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml) — on push to `main` (paths under `apps/pwa/`, `packages/shared/`, or the workflow file), or **workflow_dispatch**, it runs `npm ci` + `npm run build` in `apps/pwa`, then `wrangler pages deploy`.

### One-time: Cloudflare

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** — create project **`peer-support-pwa`** (or change the name in the workflow, [`apps/pwa/wrangler.toml`](../apps/pwa/wrangler.toml), and [`apps/pwa/package.json`](../apps/pwa/package.json) `deploy:pages` script).
2. Create an **API Token** with **Cloudflare Pages — Edit**. Copy **Account ID** from the Workers & Pages overview.

### One-time: GitHub Actions secrets

In the **GitHub** repo: **Settings → Secrets and variables → Actions**

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | API token from Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Cloudflare dashboard |

Pushes to `main` that touch `apps/pwa/` or the workflow file trigger **Deploy PWA to Cloudflare Pages**. You can also run it from the **Actions** tab.

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

From `apps/pwa`:

```bash
npm run deploy:pages
```

(or `npm run build` then `npx wrangler pages deploy dist --project-name=peer-support-pwa`).

### Cloudflare “Connect Git” instead of Actions

If you prefer Cloudflare to run the build (no GitHub Action):

- **Root directory:** `apps/pwa`
- **Build command:** `npm ci && npm run build` (`apps/pwa/.npmrc` enables `npm ci` with Vite 8 + `vite-plugin-pwa`.)
- **Build output directory:** `dist`

### `staticwebapp.config.json`

[`apps/pwa/public/staticwebapp.config.json`](../apps/pwa/public/staticwebapp.config.json) is harmless on Cloudflare; it is only used if you ever deploy the same `dist` to Azure Static Web Apps again.

## SPA behavior on Pages

Cloudflare Pages treats the app as an SPA when there is **no** top-level `404.html`. Do not add a root `404.html` unless you intend to change that behavior.
