# PEERPoint PWA: GitHub Actions + Cloudflare Pages

**PWA build and hosting** use **GitHub Actions** (CI) and **Cloudflare Pages** (static hosting). Azure Static Web Apps and Azure Pipelines definitions were removed from this repo in favor of that path.

The **SPFx web part** still packages and deploys to **SharePoint** separately (`peer-support-app`); that flow is unchanged.

## Day-to-day development (local)

1. PWA:
   ```bash
   cd apps/pwa
   npm install
   npm run dev
   ```
2. SPFx web part (when needed):
   ```bash
   cd peer-support-app
   npm install
   gulp serve
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

Pushes to `main` that touch `apps/pwa/`, `packages/shared/`, or the workflow file trigger **Deploy PWA to Cloudflare Pages**. You can also run it from the **Actions** tab.

### Git repository layout

- **GitHub** (for Actions + Pages): **https://github.com/sssamiam2-prog/peer-support-app** — add `git remote add github <url>` if you clone without it (remote name `github`).
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

### Entra ID (sign-in)

Add each **preview and production** origin (e.g. `https://peer-support-pwa.pages.dev` and branch preview URLs) as **SPA redirect URIs** for the app registration used by the PWA.

### Cloudflare “Connect Git” instead of Actions

If you prefer Cloudflare to run the build (no GitHub Action):

- **Root directory:** `apps/pwa`
- **Build command:** `npm ci && npm run build` (`apps/pwa/.npmrc` enables `npm ci` with Vite 8 + `vite-plugin-pwa`.)
- **Build output directory:** `dist`

### `staticwebapp.config.json`

[`apps/pwa/public/staticwebapp.config.json`](../apps/pwa/public/staticwebapp.config.json) is harmless on Cloudflare; it is only used if you ever deploy the same `dist` to Azure Static Web Apps again.

## SPA behavior on Pages

Cloudflare Pages treats the app as an SPA when there is **no** top-level `404.html`. Do not add a root `404.html` unless you intend to change that behavior.
