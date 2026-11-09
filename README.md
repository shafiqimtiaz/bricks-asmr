# Bricks ASMR

A browser-based brick-breaker with Solo mode, a global leaderboard, and an existing experimental multiplayer mode.

- **Live game:** https://bricks-asmr.shafiqimtiaz.workers.dev
- **Current multiplayer:** https://bricks-asmr.shafiqimtiaz.workers.dev/multiplayer
- **Planned multiplayer redesign:** [docs/MULTIPLAYER_REDESIGN.md](docs/MULTIPLAYER_REDESIGN.md)

> The planned unified 2–4 Solo-board multiplayer experience is documented, **not yet implemented**. Do not treat the current shared-arena multiplayer as the finished redesign.

## Prerequisites

- Node.js **22.18+** (Cloudflare Builds supports Node 24)
- npm
- A Cloudflare account with permissions to deploy Workers, Durable Objects, and D1

## Local development and deployment

```bash
npm install
npm run dev         # Local Worker + bindings
npm run build       # Build only; no production changes
npm run check       # Build + deployment validation; dry-run only
npm run deploy      # Build and deploy the Worker to Cloudflare
```

Log in once before the first manual deployment:

```bash
npx cf auth login
```

`npm run deploy:ci` runs `cf deploy --prebuilt`: it deploys the output of a preceding `npm run build` without building twice. Use it **only after** a successful build.

This is a Cloudflare **Worker**, not a Node.js HTTP server. Production runs automatically at the Worker URL; there is no separate production `npm start` or long-running server command.

### Cloudflare Workers Builds (Git integration)

Connect **this existing Worker** (`bricks-asmr`) to the repository `shafiqimtiaz/bricks-asmr`, branch `main`, under **Workers & Pages → bricks-asmr → Settings → Builds**.

| Setting | Value |
| --- | --- |
| Repository | `shafiqimtiaz/bricks-asmr` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy:ci` |
| Previews | Disabled until explicitly configured and validated |
| Build runtime | Node.js 22.18+ (Node.js 24 recommended) |

**Authentication:** Workers Builds needs a dedicated **user-scoped build token**, selected or created in the Builds settings. Do not reuse tokens named for other projects. The GitHub repository connection by itself does **not** enable automatic builds.

Do not connect a production deployment trigger until the token is provisioned and the first build has passed. Subsequent pushes to `main` can then deploy automatically.

For instructions on tokens and builds, see [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) and [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Worker configuration

The single source of deployment configuration is [cloudflare.config.ts](cloudflare.config.ts) using Cloudflare's `cf` CLI. Do **not** add an unrelated `wrangler.toml` or `wrangler.jsonc`: Wrangler doesn't read `cloudflare.config.ts` and conflicting configurations risk deploying the wrong Worker or dropping bindings.

| Binding | Existing Cloudflare resource |
| --- | --- |
| `DB` | D1 database, `786779d1-68ed-49d0-a6ee-434d76143b85` |
| `ROOMS` | `BrickRoom` SQLite Durable Object, in `bricks-asmr` Worker |

These bindings reference existing production resources. Avoid reinitializing production D1, resetting Durable Object migrations, or deleting live room namespaces as part of deployment setup.

## Current source

- `src/index.mjs`: Solo application, leaderboard, routes
- `src/multi.mjs`: Current multiplayer UI and Durable Object implementation
- `schema.sql`: Reference schema for the existing leaderboard (not an automatic production migration)
- `docs/MULTIPLAYER_REDESIGN.md`: Future unified TypeScript Solo/multiplayer architecture and acceptance criteria

The existing source is JavaScript; migrating to shared TypeScript modules is part of the separate redesign plan.

## Deployment verification

After a deployment, check:

1. `/` — original Solo game loads.
2. `/leaderboard` — existing leaderboard loads.
3. `/multiplayer` — existing multiplayer room UI loads.
4. D1 `DB` and Durable Object `ROOMS` bindings remain available.
