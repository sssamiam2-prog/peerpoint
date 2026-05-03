# Develop locally, keep Azure Repos, preview on Cloudflare Pages

Use **Azure DevOps Git** for everyday commits, and optionally **GitHub + Cloudflare Pages** for HTTPS preview URLs without Azure Pipelines parallelism.

## Day-to-day development (no cloud deploy)

1. Clone from Azure Repos (or open your existing folder).
2. PWA:
   ```bash
   cd apps/pwa
   npm install
   npm run dev
   ```
3. SPFx web part (when needed):
   ```bash
   cd peer-support-app
   npm install
   gulp serve
   ```

Commit and push to `main` (or your branch) on Azure Repos as usual.

## Optional: GitHub mirror + Cloudflare Pages

### Why

- **Cloudflare Pages** serves the static `dist/` build with preview URLs per branch.
- **GitHub Actions** in this repo can build and run `wrangler pages deploy` (see `.github/workflows/cloudflare-pages.yml`).
- Your **canonical** repo can stay on Azure DevOps; GitHub is only a mirror for Pages if you want.

### One-time: GitHub repository

1. Create an empty repo on GitHub (same org or personal), e.g. `peer-support-app`.
2. Add a remote and push (from repo root):

   ```bash
   git remote add github https://github.com/<ORG>/<REPO>.git
   git push -u github main
   ```

   To refresh the mirror later: `git push github main`.

   (Alternatively use **Azure DevOps → Project settings → Repositories → Mirroring** to push to GitHub automatically.)

### One-time: Cloudflare

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** *or* create an empty project first for CLI/GitHub Actions.
2. Create a **Pages** project whose name matches the default in this repo: **`peer-support-pwa`** (or pick another name and change it in `.github/workflows/cloudflare-pages.yml`, `apps/pwa/wrangler.toml`, and `apps/pwa/package.json` script `deploy:pages`).
3. Create an **API Token** with **Cloudflare Pages — Edit** (and account read if prompted). Copy **Account ID** from Workers & Pages overview.

### One-time: GitHub Actions secrets

In the **GitHub** repo: **Settings → Secrets and variables → Actions**

| Name | Value |
|------|--------|
| `CLOUDFLARE_API_TOKEN` | API token from Cloudflare |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Cloudflare dashboard |

If your Pages project name is not **`peer-support-pwa`**, edit `--project-name` in `.github/workflows/cloudflare-pages.yml`, `apps/pwa/wrangler.toml` (`name`), and `apps/pwa/package.json` (`deploy:pages` script) to match.

Pushes to `main` that touch `apps/pwa/`, `packages/shared/`, or the workflow file trigger **Deploy PWA to Cloudflare Pages**. You can also run it manually from the **Actions** tab.

### Local deploy to Pages (no GitHub)

From `apps/pwa` after a production build:

```bash
npm run build
npx wrangler pages deploy dist --project-name=peer-support-pwa
```

Or `npm run deploy:pages` (uses the same project name; edit `package.json` if you renamed the project).

### Entra ID (sign-in)

Add each **preview and production** origin (e.g. `https://peer-support-pwa.pages.dev` and branch preview URLs) as a **SPA redirect URI** for the app registration used by the PWA, or users will see redirect errors after deploy.

### Cloudflare “Connect Git” instead of Actions

If you prefer Cloudflare to build the site (no GitHub Action):

- **Root directory:** `apps/pwa`
- **Build command:** `npm ci && npm run build` (the repo includes `apps/pwa/.npmrc` so `npm ci` resolves `vite-plugin-pwa` with Vite 8.)
- **Build output directory:** `dist`

You still need a **GitHub** (or GitLab) connection for that wizard; Azure Repos alone is not supported as a first-class Pages Git source.

### Mirror repo for this project

GitHub remote (push target): **https://github.com/sssamiam2-prog/peer-support-app**

Code is mirrored there from Azure Repos; add `git remote add github <url>` if you clone fresh (remote name `github`).

### Push workflows to GitHub (`workflow` OAuth scope)

GitHub rejects pushes that create or update `.github/workflows/*.yml` unless the credential includes the **`workflow`** scope (classic PAT or GitHub CLI).

If `git push github main` fails with `workflow scope`, run:

```bash
gh auth refresh -s workflow -h github.com
```

Finish the browser/device login, then push again:

```bash
git push github main
```

Until those files exist on GitHub, **Actions** will not run; `gh workflow list` stays empty.

## SPA behavior on Pages

Cloudflare Pages treats the app as an SPA when there is **no** top-level `404.html`. Do not add a root `404.html` unless you intend to change that behavior.
