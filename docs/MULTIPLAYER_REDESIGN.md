# Bricks ASMR — Unified Solo & Shared-Board Multiplayer Plan

**Status:** Shared level generator, bounce/velocity helpers, brick art, ASMR synth, and crusher cadence now reused across Solo and Multiplayer; full effect and input-flow parity remains open  
**Updated:** 2026-11-09  
**Repository:** [shafiqimtiaz/bricks-asmr](https://github.com/shafiqimtiaz/bricks-asmr)

> This document specifies the intended design, not a completed implementation. It supersedes the earlier "one Solo board per player" plan and the existing separate green multiplayer page. **Multiplayer has exactly one shared game board, regardless of player count.** Only the occupied sides gain player-controlled paddles. Do not deploy a partial visual-only change as the finished design.

## 1. Non-negotiable requirements

1. **One home experience.** The existing Solo game is the visual and gameplay foundation. Entering Multiplayer uses the same pixel typography, HUD, panels, graphics, sound, themes, animations and interaction language. Do not create another landing-page brand.
2. **One shared board, always.** With 1 waiting player or 2, 3 or 4 joined players, render **exactly one** game arena. Never render 2–4 separate Solo arenas or mini previews.
3. **One paddle per participating player.** Place paddles on the **bottom, top, left and/or right edges** of that same arena. Each player controls their own paddle and cannot move another player's.
4. **Shared gameplay.** Every player sees the same bricks, balls, collisions, power-ups, destruction, effects and match state in real time. This is one cooperative/shared simulation, **not** independent runs with a common seed.
5. **Solo visual fidelity.** Preserve the recognizable brick art, square tiles, ball physics feel and ASMR effects while allowing the shared logical arena dimensions to follow the selected screen aspect ratio, ball physics feel, break effects, synthesized ASMR, HUD language, Clean / CRT-Vintage / Vapor themes, and pixel animations. Add only the boundary and paddle logic necessary for additional players.
6. **Mobile first.** The single board must fill the available viewport on phones, tablets, laptops, desktops and TVs, with no horizontal scrolling, clipped paddles or inaccessible controls.
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
| 3 | **1** | Bottom + top + left | Right |
| 4 | **1** | Bottom + top + left + right | None |

These are progressive paddle assignments on one board, not separate boards. Seats are allocated in bottom → top → left → right order. **A new arrival or departure must never relocate a player already seated or reset their paddle position.** A new player fills the first available edge; all assignments remain fixed during the active round. Occupied sides get one paddle and player label; unoccupied sides behave as ordinary reflective boundaries without decorative or artificial paddles.

The shared brick formation compresses into the middle as players join, leaving approach lanes for the occupied top/bottom and left/right paddles. More participants mean fewer bricks, not extra boards. During a round the authoritative crusher progressively expands that formation toward occupied sides, using Solo's crusher cadence: top and bottom for two players, then left and right as those seats become occupied. The board remains one authoritative room-specific logical game world. The host's device aspect selects its dimensions when the room is created. **Every client renders that same world**, rotating its player POV to put its own paddle at the bottom without stretching any axis. This is a local camera only: there are no additional boards, and the engine state, impacts, timers and power-ups remain shared. Top/bottom and left/right paddles use equivalent proportional reach along their respective edges. Clearly highlight the viewer's own paddle. A player's input maps to their assigned side: horizontal movement for top/bottom, vertical movement for left/right. Touch and keyboard input must not interfere with page navigation or another player's paddle.

The host picks a mode in the lobby; neither mode has a timer. **Coop:** the whole board shares one ball and one pool of lives (3 per player); whoever misses it loses a life and serves the next one (a teammate serves if they are out); the round ends when the board is cleared or everyone is out. **Versus:** one ball per player still in play; whoever misses loses a life and serves the replacement, whoever launched it; the last player standing wins, or the top score if the board is cleared first. Served balls wait on the server's paddle, aimed Solo-style (drag the board or W/S, tap or Space to launch; auto-launch after 5 seconds). Leaving a live round, or staying disconnected for 30 seconds, counts as out. Power-ups may split balls within the shared cap. All balls collide with the same bricks and active paddles. Retain Solo collision feel and existing power-ups; adapt edge collision rules to active paddles vs inactive walls. Nobody should see a different brick being destroyed on their screen.

### Lobby and home

The home presentation opens a unified **Bricks ASMR Lobby** with distinct Single Player and Multiplayer choices, a small italic "by Shafiq 😉" byline, and matching Clean / CRT / Vapor styling. Each mode has a compact top bar; less-used settings and actions move into a menu. Multiplayer hosting, entering a required player name, joining by room code, copying an invite URL, waiting and starting use the same lobby visual language.

The host may start when **at least two players are connected**. While waiting, the same board remains visible with only joined paddles. Starting locks the round's paddle assignments and shared level state. Late joins to an active round are not allowed unless joining as an authenticated reconnect to an existing seat.

### Responsive presentation

The same shared arena geometry works at tall-mobile, square, landscape, ultrawide, and TV aspect ratios. Instead of stretching a fixed portrait canvas, the game selects a logical arena width from the display aspect ratio, **reflows the shared brick generator into an appropriately sized grid of square cells**, and uses matching collision boundaries and paddle positions. Uniform canvas scaling preserves brick, ball, and paddle proportions. On desktop, the Lobby docks beside a landscape arena when space permits; on mobile it overlays the playfield. The host selects the Multiplayer room's authoritative dimensions at creation, so participants on different devices share identical bricks, hits, physics and power-ups. Side-seat camera rotation preserves geometry and puts the assigned paddle at the bottom even where the rotated room appears portrait. Canvas backing resolution remains capped. Never create additional boards or horizontally scrolling gameplay.

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

Handle temporary disconnects without duplicating seats. A disconnected player's side becomes an inactive wall during play; restore the same paddle on successful authenticated resume. An explicit leave during a waiting lobby may reassign paddles; assignments do not jump during an active match. Prevent duplicate match starts and preserve room expiry semantics.

## 5. Migration and verification gates

### Phase 0 — Baseline
Capture the Solo board and controls in all three themes and record seeded-level output, collision/power-up behavior and current leaderboard behavior.

**Gate:** Existing Solo screen and gameplay have reproducible baseline checks.

### Phase 1 — Extract the common engine and renderer
Introduce TypeScript types and runtime validation. Migrate the original Solo physics, brick generation, drawing, FX, audio and controls into reusable modules without altering Solo behavior.

**Gate:** Solo renders and plays as before; tests and type checks pass.

### Phase 2 — One unified home and lobby
Replace the separate green Multiplayer landing page with the original Solo visual system. Reuse room creation/joining, labels, invites and Solo-style overlays. Always render one board.

**Gate:** 1, 2, 3 and 4 joined players all see exactly one shared arena with the correct number of paddle edges; no unoccupied paddles.

### Phase 3 — Shared authoritative multiplayer
Replace the current square-arena simulation with one shared instance of the common engine in the room Durable Object. Synchronize paddle inputs and world snapshots while keeping each client read-only except for its own paddle.

**Gate:** 2–4 concurrent clients see the same ball positions, bricks and power-ups; only their own paddles respond to their controls.

### Phase 4 — Polish and resilience
Adapt rotated side-seat inputs, collision balance, sound, postprocessing, HUD, joined-player names, reconnect handling and touch controls. Verify host/rejoin/start/end behavior, including player count changes in the lobby.

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
- [ ] Same responsive Solo brick field, renderer, physics feel, power-ups, ASMR and effects
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
- One shared responsive arena, reusing the Solo HUD and Clean/CRT/Vapor presentation.
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

## 9. Shared JavaScript gameplay foundation (November 9, 2026)

Solo and Multiplayer now consume `src/game-core.mjs` for the deterministic seeded brick generator, brick/palette metadata, velocity normalization, equivalent Solo-angle paddle bounce, per-cell pixel drawing, the compressed ASMR oscillator, brick-note scale, and crusher timing. Solo calls the level generator without multiplayer pruning; Multiplayer keeps one server-authoritative world and removes bricks to make space for extra players. The multiplayer crusher applies a synchronized 2D transform toward all occupied sides, with physics coordinates inverted through the same transform. Each client then rotates that single world into its personal bottom-paddle view.

**Remaining gameplay parity gaps:** Solo still includes theme-specific power-ups (and falling pickups), manual aiming/launch, a stopwatch and extra visual feedback that Multiplayer has not completely adopted. Multiplayer currently uses a room-timed round and simplified immediate power-ups. Those differences must not be described as full Solo/Multiplayer mechanic parity. The new shared core is JavaScript, not the planned TypeScript migration. Browser-based live 2–4-player endurance verification also remains outstanding.

## 10. Level alignment, camera and layout fixes (November 11, 2026)

- **Levels.** Multiplayer no longer crops and thins a Solo board. `bricks()` runs Solo's generator on the multiplayer field itself (smaller as players join), so every round is a whole level with the same archetypes, walls, symmetry and palettes. Round number = level number, shown in the HUD and on the countdown card with the level's archetype, as in Solo. Power-up density stays higher than Solo and corridor length scales with the field.
- **One geometry.** `paddleShape()`, `boardView()`, `viewPoint()`, `sliderPos()` and `stageFit()` live in `game-core.mjs` and are used by the room server and both pages. Paddles are drawn where the room collides them (the room allows 4px of grace for latency), and all four paddles sit symmetrically inside the court.
- **Camera.** Each client rotates the court about its centre, so every seat sees its own paddle directly above the slider. Previously top and side seats had their paddle hidden under the slider and labels over the bricks.
- **HUD.** The HUD owns the top 36 logical pixels; on small screens the remainder hangs above the stage instead of covering the top paddle or brick rows.
- **Play feel.** A replacement ball rides its owner's paddle for 1.2s before launching. Players start with 5 lives. Remote paddles are eased between snapshots, held keys move the paddle smoothly, countdown and buff timers use the room's clock, and bricks are cached at device resolution.
- **Lobby.** Friends can join between rounds, not only before the first.
- **Pickups.** A power-up brick releases a capsule that falls toward the player whose ball broke it and takes effect only if that player catches it, as in Solo. Capsules look the same in every theme because the power-up set is shared by the room; Solo's per-theme sets stay Solo-only by design.
- **Launch.** A held replacement ball launches on a tap on the board or Space, or by itself after 2.5s.
- **Still open from section 9:** drag-to-aim and Solo's stopwatch scoring are not in Multiplayer (rounds stay timed and scored). The room is always the portrait arena: the host-aspect option is not wired through the room-creation route.

## 11. Top bar, visual pass and new mechanics (November 11, 2026)

- **Top bar (both modes).** Level chip, lives as brick pips, clock (red in the last 10 seconds of a round) and a line along the bottom edge that fills as the board is cleared. Solo's speed button is removed.
- **Multiplayer visuals.** Pre-rendered court backdrop with glow, grid and frame; rounded paddles with a highlight; tapered ball trails that turn gold as a rally speeds up; score pop-ups; a pulsing combo banner.
- **Combo.** Bricks broken within 1.5s of each other build a combo; every five links add a multiple to brick score, up to x5. A miss resets it.
- **Rally.** Each paddle return speeds that ball up 3%, to 30% at most. A replacement ball starts at base speed.
- **Difficulty.** Base ball speed is 300 (was 330) in both modes via `ballSpeed()`. Solo starts with 5 lives and only previews the launch aim. Multiplayer starts with 4 lives (max 6) and 2px of paddle grace.
