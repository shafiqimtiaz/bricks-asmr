# Bricks ASMR

A browser-based brick-breaking game with retro effects, a global leaderboard, and real-time four-sided multiplayer.

**Live game:** https://bricks-asmr.shafiqimtiaz.workers.dev
**Multiplayer:** https://bricks-asmr.shafiqimtiaz.workers.dev/multiplayer

## Modes

- **Solo:** The original brick-breaking game, with selectable themes and daily challenges.
- **Leaderboard:** Personal best times per challenge in the existing Cloudflare D1 database.
- **Multiplayer:** Rooms for 2–4 people, joined by a six-character code. Each player views their own paddle at the bottom. The authoritative game loop runs in a Cloudflare Durable Object over WebSockets.

## Development

Requires Node.js 22.18 or newer and a Cloudflare account authorized for Workers, D1, and Durable Objects.

```sh
npm install
npm run dev
```

Deploy the same Worker:

```sh
npm run deploy
```

`cloudflare.config.ts` is the source of the runtime bindings and deployment target. The `cf` CLI builds this project through Wrangler; Wrangler is used as a bundler, not as the deployment CLI.

## Source files

- `src/index.mjs` — solo gameplay, leaderboard, and multiplayer routing
- `src/multi.mjs` — multiplayer UI and Durable Object room/game state
- `cloudflare.config.ts` — Worker configuration and existing D1 / Durable Object bindings
- `schema.sql` — reference schema for the leaderboard (do not apply blindly to production)

The source was exported from the live Worker to initialize this repository. Production D1 records and Durable Object state are not stored here.

## Deployment

To connect automated deployment, select this repository and branch `main` under **Cloudflare → Workers & Pages → bricks-asmr → Settings → Builds**. Use `npm run deploy` as the deploy command. The build system requires a Cloudflare build token with permission to deploy this Worker.
