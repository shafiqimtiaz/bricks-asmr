# Bricks ASMR

A browser-based brick-breaker with Solo mode, a global leaderboard, and a live, single-board multiplayer mode.

**Play:** https://bricks-asmr.shafiqimtiaz.workers.dev  
**Shared-board multiplayer:** https://bricks-asmr.shafiqimtiaz.workers.dev/multiplayer

Multiplayer reuses the Solo game's portrait board and Clean, CRT, and Vapor aesthetics. All players see one authoritative game world with paddles activated on occupied edges (bottom/top/left/right). The original Solo HUD now includes a **2P+** multiplayer shortcut. Use **COPY LINK** in a room to invite friends: opening a room-specific invite URL automatically joins with a randomized guest name, then offers an optional gamer-name edit. Existing members resume their authenticated seat without duplicating it. Older `?room=CODE` invite links continue to work. Manual joining remains available. See [the multiplayer plan](docs/MULTIPLAYER_REDESIGN.md) for implemented features and remaining parity/testing work.

## Development and deployment

Requires Node.js 22.18 or later. Cloudflare Workers serves production requests; no always-running Node server is required.

```sh
npm install
npm run dev      # Run locally
npm run build    # Build/validate without uploading
npm run check    # Equivalent dry-run validation
npm test         # Shared-board regression tests
npm run deploy   # Deploy to Cloudflare
```

For a manual deployment, log in once with `npx wrangler login` or set `CLOUDFLARE_API_TOKEN`.

### Cloudflare Workers Builds (GitHub)

The existing Worker `bricks-asmr` is linked to [shafiqimtiaz/bricks-asmr](https://github.com/shafiqimtiaz/bricks-asmr). Workers Builds watches `main` and deploys from the repository root.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Preview builds | Disabled |
| Build Node.js version | 24 (Cloudflare's default) |

The Build system uses an existing **user-scoped Cloudflare build token**; replace it with a dedicated Bricks token when one can be provisioned. Keep credentials in Cloudflare, never in GitHub source.

### Configuration and bindings

[wrangler.jsonc](wrangler.jsonc) is the **only** Worker deployment configuration. Cloudflare's beta `cf deploy` CLI currently rejects the first unattended deployment of a Worker that was previously uploaded via Cloudflare's script API; we switched to the supported Wrangler CLI to avoid that problem.

| Binding | Resource |
| --- | --- |
| `DB` | Existing D1 `786779d1-68ed-49d0-a6ee-434d76143b85` |
| `ROOMS` | Existing SQLite Durable Object class `BrickRoom`, migration `v1` |

Do not change, clear, or recreate these resources as part of app deployment. `schema.sql` is reference-only and must not be automatically applied to production.

### Current source

- `src/index.mjs` — original Solo game, leaderboard and routing
- `src/multi.mjs` — single shared multiplayer arena, power-ups, WebSocket inputs and authoritative Durable Object game state
- `docs/MULTIPLAYER_REDESIGN.md` — shared-board implementation, accepted layout and remaining TypeScript/physics parity tasks

The future TypeScript migration is described in the design document, not implemented by this build-system change.

### After each deployment

Verify:

1. `/` — original Solo game
2. `/leaderboard` — leaderboard
3. `/multiplayer` — one portrait board, live room and occupied edge paddles
4. D1 and Durable Object bindings still resolve correctly
