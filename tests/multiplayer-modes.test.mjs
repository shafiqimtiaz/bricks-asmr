import assert from "node:assert/strict";
import test from "node:test";
import { aimVelocity, viewMatrix, boardView, arenaLayout } from "../src/game-core.mjs";
import { loadServer, makeRoom, roomInstance } from "./helpers.mjs";

const server = loadServer();
const { E, BrickRoom, startRound, eliminate } = server;

const player = (r, id) => r.sim.players.find(p => p.id === id);
const socketFor = id => ({ deserializeAttachment: () => ({ id }), send() {}, close() {} });
const message = (inst, id, body) => BrickRoom.prototype.webSocketMessage.call(inst, socketFor(id), JSON.stringify({ version: 1, ...body }));
// Runs the room's own loop body for `seconds` of game time.
const run = (inst, seconds) => { for (let t = 0; t < seconds; t += 1 / 20) inst.step(1 / 20, Date.now()); };
// A ball about to pass the top (seat 2) paddle, which sits at pos .5, far from x=30.
const topMiss = source => ({ x: 30, y: 52, vx: 0, vy: -330, owner: source, source });
const farBall = source => ({ x: 180, y: 300, vx: 0, vy: 300, owner: source, source });

test("starting a round builds one engine state with the room's mode, set, lives and countdown", () => {
  const versus = makeRoom(server, "versus", 3, "vapor"), S = versus.sim;
  assert.equal(versus.status, "playing");
  assert.equal(versus.round, 1);
  assert.match(versus.seed, /^[a-z0-9]{1,8}$/);
  assert.equal(S.mode, "versus");
  assert.equal(S.set, "vapor");
  assert.equal(S.maxBalls, 40);
  assert.equal(S.holdSeconds, 5);
  assert.deepEqual(S.players.map(p => [p.id, p.seat, p.lives]), [["p0", 0, 4], ["p1", 2, 4], ["p2", 1, 4]]);
  assert.equal(S.maxLives, 6);
  assert.equal(S.balls.length, 3, "versus serves a ball to every player");
  assert.ok(S.balls.every(b => b.held && b.hold === 5 + 3), "serves wait out the 3 second countdown, then 5 more");
  assert.ok(S.hp instanceof Uint8Array && S.remaining > 0);
  const coop = makeRoom(server, "coop", 3, "clean");
  assert.equal(coop.sim.pool, 9, "a pool of 3 lives per player");
  assert.equal(coop.sim.maxLives, 12);
  assert.equal(coop.sim.balls.length, 1);
  assert.equal(coop.sim.balls[0].source, "p0", "the host serves first");
  assert.equal(coop.sim.set, "clean");
  startRound(coop, "nonsense");
  assert.equal(coop.set, "vintage", "an unknown set falls back");
});

test("each round gets a fresh seed and board", () => {
  const room = makeRoom(server, "coop", 2);
  const seeds = new Set([room.seed]), boards = new Set([room.board.hp]);
  for (let i = 0; i < 6; i++) { startRound(room, "clean"); seeds.add(room.seed); boards.add(room.board.hp); }
  assert.equal(room.round, 7);
  assert.equal(seeds.size, 7);
  assert.equal(boards.size, 7);
});

test("the host's theme picks the power-up set; unknown sets are refused", async () => {
  const room = makeRoom(server, "coop", 2);
  room.status = "waiting";
  const inst = roomInstance(server, room);
  inst.save = async () => {};inst.broadcast = () => {};inst.ensureLoop = () => {};
  const post = (set, token = "token-0") => BrickRoom.prototype.fetch.call(inst, new Request("https://t/api/rooms/BRICKS/action", {
    method: "POST", headers: { cookie: "brick_room_BRICKS=" + token, "content-type": "application/json" }, body: JSON.stringify({ action: "start", set })
  }));
  assert.equal((await post("neon")).status, 400);
  assert.equal(room.status, "waiting");
  assert.equal((await post("vintage", "token-1")).status, 403);
  assert.equal((await post("vapor")).status, 200);
  assert.equal(room.status, "playing");
  assert.equal(room.set, "vapor");
  assert.equal(room.sim.set, "vapor");
  assert.equal(inst.snapshot().set, "vapor");
});

test("paddle-input, aim and launch reach the engine, validated and rate limited", async () => {
  const room = makeRoom(server, "versus", 2), S = room.sim, inst = roomInstance(server, room);
  room.startedAt = Date.now() - 1;
  await message(inst, "p0", { type: "paddle-input", seq: 1, pos: 0, aim: 9 });
  assert.equal(room.players[0].pos, 0);
  assert.equal(player(room, "p0").target, E.paddleAt(S, "p0", 0));
  assert.equal(player(room, "p0").aim, 1.05, "aim is clamped to the serve limit, not rejected");
  // A player's slider runs from their own left: the top paddle's left is the world's right.
  room.players[1].lastInputAt = 0;
  await message(inst, "p1", { type: "paddle-input", seq: 1, pos: 0 });
  assert.ok(player(room, "p1").target > S.W / 2, "seat 2 slides the other way round");
  // Stale sequence numbers, other protocol versions, junk and a flood do nothing.
  await message(inst, "p0", { type: "paddle-input", seq: 1, pos: .9 });
  await message(inst, "p0", { type: "paddle-input", seq: 5, pos: .9, version: 2 });
  await message(inst, "p0", { type: "paddle-input", seq: 6, pos: "x" });
  assert.equal(room.players[0].pos, 0);
  await message(inst, "p0", { type: "paddle-input", seq: 7, pos: .9 });
  assert.equal(room.players[0].pos, 0, "inputs closer than 25ms apart are dropped");
  room.players[0].lastInputAt = 0;
  await message(inst, "p0", { type: "paddle-input", seq: 8, pos: .9 });
  assert.equal(room.players[0].pos, .9);
  // Launch: only your own held ball, along your own aim, and not before the countdown ends.
  room.startedAt = Date.now() + 2000;
  await message(inst, "p0", { type: "launch" });
  assert.ok(S.balls.every(b => b.held), "launching during the countdown is ignored");
  room.startedAt = Date.now() - 1;
  await message(inst, "p0", { type: "launch", aim: -9 });
  const mine = S.balls.find(b => b.source === "p0"), theirs = S.balls.find(b => b.source === "p1");
  assert.ok(!mine.held && mine.vy < 0 && mine.vx < 0, "aim -1.05 goes up and to the left");
  assert.ok(theirs.held);
  // Whoever is not in the room cannot steer it.
  await BrickRoom.prototype.webSocketMessage.call(inst, socketFor("stranger"), JSON.stringify({ version: 1, type: "launch" }));
  assert.ok(theirs.held);
});

test("a held ball launches along the player's own aim, relative to their screen", () => {
  for (const seat of [0, 1, 2, 3]) {
    const speed = 300, v = aimVelocity(seat, .6, speed), [a, b, c, d] = viewMatrix(boardView(arenaLayout(), seat));
    // Rotated onto the player's screen, a positive aim goes up and to the right.
    assert.ok(a * v.vx + c * v.vy > 0 && b * v.vx + d * v.vy < 0, "seat " + seat);
    assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - speed) < 1e-9);
  }
});

test("the top paddle deflects toward the side it was hit on, as that player sees it", () => {
  const room = makeRoom(server, "versus", 2), S = room.sim, top = player(room, "p1");
  assert.equal(top.seat, 2);
  top.c = top.target = 180;
  // From the top player's view the world's -x is their right: a hit at world x < centre must leave toward world -x.
  S.balls = [{ x: 180 - 20, y: 64, vx: 0, vy: -300, owner: null, source: null }, farBall("p0")];
  for (let i = 0; i < 20 && !S.balls[0].owner; i++) E.step(S, 1 / 60);
  assert.equal(S.balls[0].owner, "p1");
  assert.ok(S.balls[0].vy > 0 && S.balls[0].vx < 0, "own right-hand hit goes to the world's -x and back down");
});

test("versus: whoever misses loses a life and serves, even when the ball was someone else's", () => {
  const room = makeRoom(server, "versus", 2), S = room.sim, inst = roomInstance(server, room);
  S.balls = [topMiss("p0"), farBall("p1")];
  run(inst, .4);
  assert.equal(player(room, "p1").lives, 3, "the player whose edge it left through pays");
  assert.equal(player(room, "p0").lives, 4);
  const held = S.balls.filter(b => b.held);
  assert.equal(held.length, 1);
  assert.equal(held[0].source, "p1");
  assert.equal(S.balls.length, 2, "one ball per player is kept");
});

test("a multiball extra that is lost never costs a life", () => {
  const room = makeRoom(server, "versus", 2), S = room.sim, inst = roomInstance(server, room);
  S.balls = [topMiss("p0"), farBall("p0"), farBall("p1")];
  run(inst, .4);
  assert.deepEqual(S.players.map(p => p.lives), [4, 4]);
  assert.equal(S.balls.length, 2);
  assert.ok(S.balls.every(b => !b.held));
  const coop = makeRoom(server, "coop", 2);
  coop.sim.balls = [topMiss("p0"), farBall("p0")];
  run(roomInstance(server, coop), .4);
  assert.equal(coop.sim.pool, 6, "coop loses a life only when the last ball goes");
});

test("coop shares one pool of lives and the misser serves; all out ends the round", () => {
  const room = makeRoom(server, "coop", 2), S = room.sim, inst = roomInstance(server, room);
  S.balls = [topMiss("p0")];
  run(inst, .4);
  assert.equal(S.pool, 5);
  assert.equal(S.balls.length, 1);
  assert.equal(S.balls[0].source, "p1", "the player whose edge the ball left through serves");
  eliminate(room, "p1");
  S.balls = [{ x: 30, y: 520, vx: 0, vy: 330, owner: "p0", source: "p0" }];
  run(inst, .4);
  assert.equal(S.pool, 4);
  assert.equal(S.balls[0].source, "p0", "a player who is out never serves");
  assert.equal(room.status, "playing", "coop continues while anyone is in");
  S.pool = 1;
  S.balls = [{ x: 30, y: 520, vx: 0, vy: 330, owner: "p0", source: "p0" }];
  run(inst, .4);
  assert.equal(room.status, "finished");
  assert.deepEqual(room.result, { reason: "allout" });
});

test("versus: the last player standing wins and the ending is in the snapshot", () => {
  const room = makeRoom(server, "versus", 2), S = room.sim, inst = roomInstance(server, room);
  player(room, "p1").lives = 1;
  S.balls = [topMiss("p0"), farBall("p0")];
  run(inst, .4);
  assert.equal(room.status, "finished");
  assert.deepEqual(room.result, { reason: "last", winner: "p0" });
  const snap = inst.snapshot();
  assert.equal(snap.status, "finished");
  assert.deepEqual(snap.result, { reason: "last", winner: "p0" });
  assert.equal(snap.players.find(p => p.id === "p1").out, 1);
  assert.equal(snap.players.find(p => p.id === "p0").out, 0);
});

test("a cleared board ends a round, in either mode, and the snapshot says so", () => {
  for (const mode of ["coop", "versus"]) {
    const room = makeRoom(server, mode, 2), inst = roomInstance(server, room);
    room.sim.remaining = 0;
    room.sim.balls.push({ x: 20, y: 300, vx: 0, vy: 300, owner: "p0", source: "p0" });
    run(inst, .1);
    assert.equal(room.status, "finished");
    assert.deepEqual(room.result, { reason: "cleared" });
    assert.equal(inst.snapshot().result.reason, "cleared");
  }
});

test("rounds have no timer: a long round keeps playing", () => {
  const room = makeRoom(server, "coop", 2), inst = roomInstance(server, room);
  inst.step(.05, Date.now() + 10 * 60000);
  assert.equal(room.status, "playing");
});

test("crushed: Coop ends the round, Versus puts only that player out", () => {
  const coop = makeRoom(server, "coop", 2), versus = makeRoom(server, "versus", 2);
  for (const [room, S] of [[coop, coop.sim], [versus, versus.sim]]) {
    // Squeeze the formation against the bottom paddle's edge.
    S.crush.target[0] = S.crush.off[0] = 1000;
    S.balls = [farBall("p1")];
    run(roomInstance(server, room), .2);
  }
  assert.equal(coop.status, "finished");
  assert.deepEqual(coop.result, { reason: "crushed" });
  assert.equal(versus.status, "finished", "one player left standing wins");
  assert.equal(player(versus, "p0").out, true);
  assert.deepEqual(versus.result, { reason: "last", winner: "p1" });
  const three = makeRoom(server, "versus", 3);
  three.sim.crush.target[0] = three.sim.crush.off[0] = 1000;
  three.sim.balls = [farBall("p1")];
  run(roomInstance(server, three), .2);
  assert.equal(three.status, "playing", "the others play on");
  assert.equal(player(three, "p0").out, true);
  assert.ok(!three.sim.balls.some(b => b.held && b.source === "p0"));
});

test("players who stay disconnected past the grace period are out; a reconnect keeps them in", () => {
  const room = makeRoom(server, "versus", 3), S = room.sim, inst = roomInstance(server, room);
  inst.setOnline(room.players[1], false);
  assert.equal(player(room, "p1").online, false, "the engine knows who is connected");
  inst.step(.05, Date.now() + 29000);
  assert.ok(!player(room, "p1").out, "within the 30 second grace");
  inst.setOnline(room.players[1], true);
  assert.equal(player(room, "p1").online, true);
  inst.setOnline(room.players[2], false);
  inst.step(.05, room.players[2].offlineAt + 31000);
  assert.equal(player(room, "p2").out, true);
  assert.ok(!player(room, "p1").out);
  assert.equal(room.status, "playing");
  Object.assign(room.players[1], { online: false, offlineAt: Date.now() - 31000 });
  inst.step(.05, Date.now());
  assert.equal(room.status, "finished");
  assert.equal(room.result.winner, "p0");
  const coop = makeRoom(server, "coop", 2);
  for (const p of coop.players) Object.assign(p, { online: false, offlineAt: Date.now() - 31000 });
  roomInstance(server, coop).step(.05, Date.now());
  assert.equal(coop.status, "finished", "a coop round with everyone gone ends");
  assert.deepEqual(coop.result, { reason: "allout" });
  void S;
});

test("a player who comes back online is served a ball when the board is short", () => {
  const room = makeRoom(server, "versus", 3), S = room.sim, inst = roomInstance(server, room);
  S.balls = S.balls.filter(b => b.source !== "p1");
  assert.equal(S.balls.length, 2);
  run(inst, .1);
  assert.equal(S.balls.length, 3);
  assert.equal(S.balls.filter(b => b.source === "p1").length, 1);
  run(inst, .1);
  assert.equal(S.balls.length, 3, "not duplicated");
  const offline = makeRoom(server, "versus", 3);
  offline.players[2].online = false;
  startRound(offline, "clean");
  assert.ok(!offline.sim.balls.some(b => b.source === "p2"), "nobody serves for a player who is not connected");
  roomInstance(server, offline).setOnline(offline.players[2], true);
  run(roomInstance(server, offline), .1);
  assert.ok(offline.sim.balls.some(b => b.source === "p2"));
});

test("leaving a live round puts that player out and hands the host over", async () => {
  const room = makeRoom(server, "versus", 3), inst = roomInstance(server, room, { live: ["p0", "p2"] });
  inst.save = async () => {};inst.broadcast = () => {};
  const response = await BrickRoom.prototype.fetch.call(inst, new Request("https://t/api/rooms/BRICKS/leave", { method: "POST", headers: { cookie: "brick_room_BRICKS=token-0" } }));
  assert.equal(response.status, 200);
  assert.equal(room.hostId, "p2");
  assert.equal(room.players.length, 3);
  assert.deepEqual(room.players.map(p => p.seat), [0, 2, 1], "seats do not move");
  assert.equal(player(room, "p0").out, true);
  assert.ok(!room.sim.balls.some(b => b.held && b.source === "p0"), "their held serve goes with them");
  assert.deepEqual(inst.pending, [{ t: "out", o: 0 }]);
  run(inst, .1);
  assert.equal(room.status, "playing", "two are left");
});

test("Versus power-ups that belong to one player change only the player who caught them", () => {
  const room = makeRoom(server, "versus", 2, "clean"), S = room.sim, inst = roomInstance(server, room);
  S.balls = [farBall("p0"), farBall("p1")];
  const p0 = player(room, "p0");
  p0.c = p0.target = 180;
  // Kind 3 in the Clean set is WIDE (kind 1 +3 balls, 2 x3, 3 wide); dropped on p0's paddle.
  S.pups = [{ x: 180, y: 520, k: 3, c: 0, r: 0, owner: "p0" }];
  run(inst, .6);
  assert.ok(p0.fx.wide > 0);
  assert.ok(!(player(room, "p1").fx.wide > 0));
  assert.ok(p0.pw > player(room, "p1").pw, "only the catcher's paddle grows");
  const snap = inst.snapshot();
  assert.ok(snap.players.find(p => p.id === "p0").fx.wide > 0);
  assert.deepEqual(snap.players.find(p => p.id === "p1").fx, {});
  // A shared effect (SLOW-MO, kind 8) is global.
  S.pups = [{ x: p0.c, y: 520, k: 8, c: 0, r: 0, owner: "p0" }];
  run(inst, .6);
  assert.ok(inst.snapshot().fx.slow > 0);
});

test("the solo-only timer power-ups become SLOW-MO in the room", () => {
  const room = makeRoom(server, "coop", 2, "vintage"), S = room.sim;
  assert.equal(E.puDef(S.set, 10, S.mode).id, "slow");
  assert.equal(E.puDef("vapor", 10, S.mode).id, "slow");
  assert.equal(E.puDef("vapor", 10, "solo").id, "freeze");
});

test("a room stored mid-round reloads and carries on", async () => {
  const room = makeRoom(server, "coop", 3, "vapor"), inst = roomInstance(server, room);
  run(inst, 2);
  const clock = room.sim.clock;
  const stored = structuredClone(room);
  let boot;
  const ctx = { storage: { get: async () => stored, put: async () => {} }, blockConcurrencyWhile: fn => { boot = fn(); }, getWebSockets: () => [] };
  const reloaded = new BrickRoom(ctx, {});
  await boot;
  const r = reloaded.room, S = r.sim;
  assert.ok(S.hp instanceof Uint8Array && S.col instanceof Uint8Array && S.rowCount instanceof Int16Array);
  assert.equal(S.remaining, room.sim.remaining);
  assert.equal(r.status, "playing");
  assert.deepEqual(S.balls.map(b => [b.x, b.y]), room.sim.balls.map(b => [b.x, b.y]));
  reloaded.liveIds = () => new Set(r.players.map(p => p.id));
  for (const b of S.balls) if (b.held) b.hold = 0;
  for (let i = 0; i < 40; i++) reloaded.step(1 / 20, Date.now());
  assert.ok(S.clock > clock);
  assert.equal(reloaded.snapshot().board.hp.length, S.hp.length);
  // A room stored before the engine existed has nothing to continue and returns to its lobby.
  const legacy = { code: "OLDONE", status: "playing", round: 3, players: [{ id: "a", seat: 0 }, { id: "b", seat: 2 }], seed: "abc", board: { hp: "" }, lastActivity: Date.now() };
  const old = new BrickRoom({ ...ctx, storage: { get: async () => legacy } }, {});
  await boot;
  assert.equal(old.room.status, "waiting");
  assert.equal(old.room.round, 3);
  assert.ok(old.room.board.hp.length > 0);
  assert.equal(old.snapshot().status, "waiting");
});

test("broadcasts stay compact: the full board once, then changed cells, with 40 balls in play", () => {
  const room = makeRoom(server, "coop", 4, "vapor"), S = room.sim, packets = [];
  const sockets = [{ readyState: 1, deserializeAttachment: () => ({ id: "p0" }), send: d => packets.push(JSON.parse(d)) }];
  const inst = roomInstance(server, room, { sockets });
  S.balls = Array.from({ length: 40 }, (_, i) => ({ x: 40 + i * 7.123456, y: 300 + (i % 5) * 11.987, vx: 123.456 - i * 9, vy: -250.5 + i * 4, owner: "p" + (i % 4), source: "p" + (i % 4) }));
  S.pups = [{ x: 100.123, y: 200.456, k: 3, c: 0, r: 0, owner: "p1" }];
  for (const p of S.players) p.fx = { wide: 5.55, laser: 3.21 };
  S.fx = { slow: 4.44 };
  inst.broadcast();
  assert.equal(packets[0].state.board.hp.length, S.hp.length);
  assert.equal(packets[0].state.board.colors.length, S.hp.length);
  assert.equal(packets[0].state.board.powerups, undefined, "capsule contents stay secret");
  inst.broadcast();
  const second = JSON.stringify(packets[1]);
  assert.equal(packets[1].state.board, undefined);
  assert.ok(second.length < 3000, "compact: " + second.length + " bytes");
  const s = packets[1].state;
  assert.equal(s.balls.length, 40);
  assert.deepEqual(s.balls[0], [40, 300, 123, -250, 0, 0]);
  assert.deepEqual(s.pups, [[100.1, 200.5, 3, 1]]);
  assert.deepEqual(s.players[0].fx, { wide: 5.6, laser: 3.2 });
  assert.deepEqual(s.fx, { slow: 4.4 });
  assert.equal(s.crush.length, 4);
  assert.equal(s.mode, "coop");
  assert.equal(s.set, "vapor");
  assert.equal(s.seed, room.seed);
  // Breaking bricks sends only those cells and the events that went with them.
  const i = S.hp.indexOf(1);
  assert.ok(i >= 0);
  S.balls = [];
  S.hp[i] = 0;S.remaining--;
  inst.collect([{ t: "break", i, owner: "p2" }, { t: "hit", i: i + 1, owner: "p2" }, { t: "cell", i }, { t: "power", owner: "p2", id: "wide", k: 3, x: 1.234, y: 2.345 }]);
  inst.broadcast();
  assert.deepEqual(packets[2].state.board, { cells: [i, 0] });
  assert.deepEqual(packets[2].state.events, [{ t: "break", i, o: 2 }, { t: "hit", i: i + 1, o: 2 }, { t: "power", o: 2, id: "wide", k: 3, x: 1.2, y: 2.3 }]);
  assert.equal(packets[2].state.remaining, S.remaining);
  inst.broadcast();
  assert.equal(packets[3].state.events, undefined, "events go out once");
  // A new round sends the whole board again.
  startRound(room, "clean");
  inst.sent = null;
  inst.broadcast();
  assert.equal(packets[4].state.board.hp.length, S.hp.length);
});

test("all four authenticated players receive the same authoritative world", async () => {
  const room = makeRoom(server, "versus", 4), packets = new Map();
  const sockets = room.players.map(p => ({ readyState: 1, deserializeAttachment: () => ({ id: p.id }), send: d => packets.set(p.id, JSON.parse(d)) }));
  const inst = roomInstance(server, room, { sockets });
  for (const [i, ws] of sockets.entries()) {
    await BrickRoom.prototype.webSocketMessage.call(inst, ws, JSON.stringify({ type: "paddle-input", version: 1, seq: 1, pos: .15 + i * .2 }));
  }
  for (const [i, p] of room.players.entries()) assert.ok(Math.abs(p.pos - (.15 + i * .2)) < 1e-8);
  inst.broadcast();
  const worlds = [...packets.values()].map(p => p.state);
  for (let i = 1; i < worlds.length; i++) assert.deepEqual(worlds[0], worlds[i]);
  assert.equal(worlds[0].players.length, 4);
  assert.equal(worlds[0].balls.length, 4);
  assert.deepEqual(worlds[0].balls.map(b => b[4]).sort(), [0, 1, 2, 3], "one held serve each");
  assert.ok(worlds[0].balls.every(b => b[5] === 1));
});
