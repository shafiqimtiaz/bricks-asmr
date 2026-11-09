# Bricks ASMR — Unified Solo & Shared-Board Multiplayer Plan

**Status:** Shared-board multiplayer, power-ups, and unified Solo entry deployed; remaining TypeScript parity and multi-client endurance verification tracked below  
**Updated:** 2026-11-08  
**Repository:** [shafiqimtiaz/bricks-asmr](https://github.com/shafiqimtiaz/bricks-asmr)

> This document specifies the intended design, not a completed implementation. It supersedes the earlier "one Solo board per player" plan and the existing separate green multiplayer page. **Multiplayer has exactly one shared game board, regardless of player count.** Only the occupied sides gain player-controlled paddles. Do not deploy a partial visual-only change as the finished design.

## 1. Non-negotiable requirements

1. **One home experience.** The existing Solo game is the visual and gameplay foundation. Entering Multiplayer uses the same pixel typography, HUD, panels, graphics, sound, themes, animations and interaction language. Do not create another landing-page brand.
2. **One shared board, always.** With 1 waiting player or 2, 3 or 4 joined players, render **exactly one** game arena. Never render 2–4 separate Solo arenas or mini previews.
3. **One paddle per participating player.** Place paddles on the **bottom, top, left and/or right edges** of that same arena. Each player controls their own paddle and cannot move another player's.
4. **Shared gameplay.** Every player sees the same bricks, balls, collisions, power-ups, destruction, effects and match state in real time. This is one cooperative/shared simulation, **not** independent runs with a common seed.
5. **Solo visual fidelity.** Preserve the original portrait 9:16 playfield, recognizable brick art, ball physics feel, break effects, synthesized ASMR, HUD language, Clean / CRT-Vintage / Vapor themes, and pixel animations. Add only the boundary and paddle logic necessary for additional players.
6. **Mobile first.** The single board must be fully visible and playable at 320px, 375px, 768px and desktop widths, with no horizontal scrolling, clipped paddles or inaccessible controls.
7. **Preserve Solo and its D1 leaderboard.** Multiplayer match results stay room-scoped and do not post unverified scores to the global Solo leaderboard.
8. **TypeScript migration.** Use a shared typed engine and renderer, with runtime-validated network messages, by migrating the existing application incrementally rather than rewriting an unrelated game.

### Explicitly not the intended design

- One complete board for every connected player
- A four-board gallery or opponent gameplay previews
- Different Solo and Multiplayer visual styles or landing pages
- Four separate simulations with independent balls, bricks or power-ups
- A square arena with unrelated brick patterns, physics and controls
- Accounts, matchmaking, chat, spectators, or more than four players

## 2. Board and paddle behavior

| Players in room | Visible game boards | Active player paddles | Inactive boundaries |
| --- | ---: | --- | --- |
| 1 (host waiting) | **1** | Bottom | Top, left, right |
| 2 | **1** | Bottom + top | Left + right |
| 3 | **1** | Bottom + left + right | Top |
| 4 | **1** | Bottom + top + left + right | None |

These are the intended balanced paddle arrangements, not separate boards. Player positions may be assigned/remapped **only while waiting**; freeze the assignment for the active round. Occupied sides get one paddle and player label; unoccupied sides behave as ordinary reflective boundaries without decorative or artificial paddles.

The board remains one authoritative portrait-coordinate game world. **Each client rotates and fits that same world to its own portrait viewport**, placing its assigned paddle at the bottom. This is a local camera only: there are no additional boards, and the engine state, impacts, timers and power-ups remain shared. Top/bottom and left/right paddles use equivalent proportional reach along their respective edges. Clearly highlight the viewer's own paddle. A player's input maps to their assigned side: horizontal movement for top/bottom, vertical movement for left/right. Touch and keyboard input must not interfere with page navigation or another player's paddle.

One ball or multiple balls from power-ups all belong to the shared simulation. All balls collide with the same bricks and each active paddle. Retain Solo collision feel and existing power-ups; adapt edge collision rules to active paddles vs inactive walls. Nobody should see a different brick being destroyed on their screen.

### Lobby and home

The home presentation opens a unified **Bricks ASMR Lobby** with distinct Single Player and Multiplayer choices, a small italic "by Shafiq 😉" byline, and matching Clean / CRT / Vapor styling. Each mode has a compact top bar; less-used settings and actions move into a menu. Multiplayer hosting, entering a required player name, joining by room code, copying an invite URL, waiting and starting use the same lobby visual language.

The host may start when **at least two players are connected**. While waiting, the same board remains visible with only joined paddles. Starting locks the round's paddle assignments and shared level state. Late joins to an active round are not allowed unless joining as an authenticated reconnect to an existing seat.

### Responsive presentation

There is **one** 9:16 board at every viewport width, with HUD and player status compactly overlaid or placed beside it when space permits. Keep the actual playfield, active paddle and touch zone large enough for usable input. Use device-safe-area insets. Do not replace the board with stacked mobile cards or make gameplay horizontally scrollable.

Themes are a **local display preference**: Clean, CRT-Vintage and Vapor change how the same shared state is rendered, not the physics or authoritative state. A user changing their theme must not change other players' themes.

## 3. Technical architecture

Preserve the current Cloudflare Worker, its D1 leaderboard binding, Durable Object namespace, room-code concept and `wrangler.jsonc`. The current source files, `src/index.mjs` and `src/multi.mjs`, are migration inputs: the Solo implementation supplies the shared rendering and mechanics, and the existing Durable Object supplies room coordination. Do **not** retain the current square-arena game as a second gameplay engine.

Suggested module boundaries (targets, not claims of existing files):

```text
src/
  game/
    engine.ts          # One shared simulation of bricks, balls, collisions and power-ups
    renderer.ts        # Original Solo visuals, reused by Solo and Multiplayer
    physics.ts         # Solo collision model extended for additional paddle edges
    audio.ts           # Existing ASMR synthesizer
    controls.ts        # Shared touch/keyboard controls with per-side mapping
  modes/
    solo.ts            # One board, one bottom paddle, existing behavior
    multiplayer.ts     # One shared board, one controlled paddle per player
  server/
    worker.ts          # Existing routes, static pages and global Solo leaderboard
    room.ts            # Durable Object: room, auth, authoritative game and broadcasts
  shared/
    types.ts           # Board, paddle, room and match types
    protocol.ts        # Versioned, validated network messages
wrangler.jsonc
tsconfig.json
package.json
```

### Ownership

- **Shared game engine:** The same source of truth for brick generation, ball movement, collisions, power-ups, lives/progress and event effects used by Solo and Multiplayer.
- **Solo client:** Drives that engine locally in Solo mode, with one bottom paddle; Solo behavior is preserved.
- **Durable Object:** Owns the single authoritative Multiplayer instance per room, joined players, paddle assignment, start/finish, inputs, reconnects and shared snapshots.
- **Multiplayer client:** Sends only its own paddle input, interpolates incoming authoritative snapshots and renders **the same shared board** using the Solo renderer and local theme.
- **D1:** Continues to support only Solo/global leaderboard data. Multiplayer room-scoped provisional results remain separate.

### Fairness and performance

The Durable Object validates inputs and advances one authoritative shared simulation so players cannot independently invent brick destruction or move opponents. Avoid four duplicate simulations or sending full image frames. Broadcast compact state/snapshot updates, render at device frame rate with interpolation and local paddle prediction where safe.

Preserve the source Solo mechanics rather than silently simplifying them to fit the server. Benchmark the shared engine under multiple balls/power-ups; tune snapshot rates without changing actual simulation rules. Do not claim the match is cheat-proof before adversarial testing.

## 4. Room protocol and lifecycle

Use the existing authenticated room sessions and Durable Object WebSockets with TypeScript discriminated unions plus runtime validation.

| Direction | Message | Purpose |
| --- | --- | --- |
| Client → room | `join` / `resume` | Establish or resume a single authenticated player seat |
| Host → room | `start` | Request match start (requires two online players) |
| Room → all | `room-state` | Current members and occupied paddle edges |
| Room → all | `match-start` | Round ID, common seed/level, paddle assignments and start time |
| Client → room | `paddle-input` | Authenticated player's normalized paddle position |
| Room → all | `game-state` | Authoritative shared balls, bricks, paddles, power-ups, scores and lifecycle |
| Room → all | `match-end` | Final room result, restart eligibility |

Do not accept a client-supplied player ID as authority: identify the sender from its authenticated socket/session and map inputs to that player's assigned paddle. Validate event types, message sizes, numeric positions, sequence ordering and rate limits. Reject stale/unknown messages and never allow one client to set another player's paddle or shared brick state.

Handle temporary disconnects without duplicating seats. A disconnected player's side becomes an inactive wall for play (or follows one consistent documented reconnection rule); restore the same paddle on successful authenticated resume. An explicit leave during a waiting lobby may reassign paddles; assignments do not jump during an active match. Prevent duplicate match starts and preserve room expiry semantics.

## 5. Migration and verification gates

### Phase 0 — Baseline
Capture the Solo board and controls in all three themes and record seeded-level output, collision/power-up behavior and current leaderboard behavior.

**Gate:** Existing Solo screen and gameplay have reproducible baseline checks.

### Phase 1 — Extract the common engine and renderer
Introduce TypeScript types and runtime validation. Migrate the original Solo physics, brick generation, drawing, FX, audio and controls into reusable modules without altering Solo behavior.

**Gate:** Solo renders and plays as before; tests and type checks pass.

### Phase 2 — One unified home and lobby
Replace the separate green Multiplayer landing page with the original Solo visual system. Reuse room creation/joining, labels, invites and Solo-style overlays. Always render one board.

**Gate:** 1, 2, 3 and 4 joined players all see exactly one portrait arena with the correct number of paddle edges; no unoccupied paddles.

### Phase 3 — Shared authoritative multiplayer
Replace the current square-arena simulation with one shared instance of the common engine in the room Durable Object. Synchronize paddle inputs and world snapshots while keeping each client read-only except for its own paddle.

**Gate:** 2–4 concurrent clients see the same ball positions, bricks and power-ups; only their own paddles respond to their controls.

### Phase 4 — Polish and resilience
Adapt portrait-board side inputs, collision balance, sound, postprocessing, HUD, joined-player names, reconnect handling and touch controls. Verify host/rejoin/start/end behavior, including player count changes in the lobby.

**Gate:** Mobile tests at 320, 375 and 768px and desktop show the entire board without scrolling or clipped controls, with all three themes intact.

### Phase 5 — Release
Review a focused PR with visual comparisons and tests. Merge only when accepted, deploy the existing Cloudflare Worker, then smoke-test Solo, multiplayer and the global Solo leaderboard independently.

**Gate:** All checks below pass. Preserve existing D1 data and Cloudflare bindings.

## 6. Acceptance checklist

- [x] Exactly **one** homepage and one visual identity, based on Solo
- [x] **One shared board at all player counts**
- [x] One waiting player = 1 paddle; two players = 2 paddles; three = 3; four = 4
- [x] Bottom/top/left/right edge paddles assigned only to participating players
- [x] No independent player boards, remote thumbnails or four-sided replacement game
- [ ] Same portrait Solo brick field, renderer, physics feel, power-ups, ASMR and effects
- [ ] All players see the same shared balls, brick destruction and game events
- [x] Each player controls exactly their assigned paddle, with side-appropriate touch and keyboard input
- [ ] Host start requires two online players; authenticated reconnects do not duplicate seats
- [x] Authoritative input validation and bounded, efficient WebSocket snapshots
- [ ] Clean, CRT-Vintage and Vapor render the shared game correctly
- [ ] No horizontal scrolling or clipped HUD/paddles on mobile
- [ ] Original Solo game and global D1 leaderboard keep working
- [ ] Regression tests, 2–4-client integration tests and visual comparisons pass

## 7. Deployment policy

The initial implementation was merged in [PR #1](https://github.com/shafiqimtiaz/bricks-asmr/pull/1) and deployed to the existing Cloudflare Worker. Solo, D1, and the production Durable Object namespace were retained. Further gameplay parity changes still require tests and review before release.

## 8. Implementation progress (November 8, 2026)

**Implemented and checked:**
- One shared portrait arena, reusing the Solo HUD and Clean/CRT/Vapor presentation.
- Occupied paddle positions for one through four joined players; no decorative player boards.
- Shared authoritative ball, brick and paddle state through Cloudflare Durable Objects.
- Original Solo deterministic brick patterns and palettes for equivalent seed and level.
- Validated, sequenced paddle input tied to authenticated room seats.
- Seventeen regression tests covering 1–4 paddle positions, deterministic levels, multiball misses, all four collisions, power-up activation, timeouts, versioned inputs, shared snapshots, countdown, and both WebGL/touch canvas targets.
- Preserved D1 bindings and the existing Solo/global leaderboard.
- Added a 2P+ launcher to the existing Solo HUD (no separate home design).
- Activated authoritative multiball, wide paddles, piercing, shockwave, chain blast, extra lives, speed modifiers, and time extension from generated power-up cells.
- Added a synchronized 3-second countdown, active buff indicators and local paddle input prediction.
- Reduced redundant WebSocket traffic by sending board metadata once and brick HP changes only when needed.
- Fixed CRT/Vapor pointer input to target the visible WebGL canvas, not just the hidden 2D canvas.
- Implemented and released [PR #2](https://github.com/shafiqimtiaz/bricks-asmr/pull/2) and [PR #3](https://github.com/shafiqimtiaz/bricks-asmr/pull/3). The isolated QA Worker was deleted after verification.

**Not yet fully verified or ported:**
- Complete Solo power-up and physics parity, and extraction of the original engine/rendering into shared TypeScript modules.
- Two-to-four simultaneous browser clients through a complete live match (Cloudflare Browser Rendering returned HTTP 429 during the concurrent test). Simulated four-client authoritative state tests passed; that is not a substitute for a live endurance test.
- Full visual/device checks at every specified viewport size and reconnect testing under real network interruption.

The multiplayer release includes the core shared-board gameplay, synchronized boosts and reliable input fixes. It is deployed and regression-tested, but the full common TypeScript engine extraction, exact Solo effect parity, and the real four-client complete-match gate remain open.
