import assert from "node:assert/strict";
import test from "node:test";
import { aimVelocity, viewMatrix, boardView, arenaLayout } from "../src/game-core.mjs";
import { loadServer } from "./helpers.mjs";

const { assignSides, startRound, advanceBall, BrickRoom } = loadServer();

function room(mode, count = 2) {
  const players = Array.from({ length: count }, (_, i) =>
    ({ id: "p" + i, seat: -1, pos: .5, lives: 3, score: 0, online: true, lastSeq: -1, lastInputAt: 0 }));
  assignSides(players);
  const r = { code: "BRICKS", players, status: "waiting", round: 0, mode, hostId: "p0" };
  startRound(r);
  return r;
}
const player = (r, id) => r.players.find(p => p.id === id);
const handler = r => ({ room: r, stopLoop() {}, save: async () => {} });
// A ball about to pass the top (seat 2) paddle, which sits at pos .5, far from x=30.
const topMiss = (source) => ({ x: 30, y: 52, vx: 0, vy: -330, owner: source, source });

test("versus serves one held ball to every player; coop serves a single ball from the host", () => {
  const versus = room("versus", 3);
  assert.equal(versus.balls.length, 3);
  assert.ok(versus.balls.every(b => b.hold > 0));
  const coop = room("coop", 3);
  assert.equal(coop.balls.length, 1);
  assert.equal(coop.balls[0].source, "p0");
  assert.ok(coop.balls[0].hold > 0);
});

test("versus: whoever misses loses a life and serves, even when the ball was someone else's", () => {
  const r = room("versus");
  const missed = topMiss("p0");
  r.balls = [missed, { x: 180, y: 300, vx: 0, vy: 300, owner: "p1", source: "p1" }];
  advanceBall(r, missed, .01);
  assert.equal(player(r, "p1").lives, 3);
  assert.equal(player(r, "p0").lives, 4);
  assert.equal(r.balls.length, 2, "one ball per player is kept");
  const served = r.balls.filter(b => b.hold > 0);
  assert.equal(served.length, 1);
  assert.equal(served[0].source, "p1");
});

test("versus: an eliminated player's miss is not replaced and the last player standing wins", () => {
  const r = room("versus");
  player(r, "p1").lives = 1;
  const missed = topMiss("p0");
  r.balls = [missed, { x: 180, y: 300, vx: 0, vy: 300, owner: "p0", source: "p0" }];
  advanceBall(r, missed, .01);
  assert.equal(player(r, "p1").lives, 0);
  assert.equal(r.balls.length, 1);
  BrickRoom.prototype.step.call(handler(r), .05, Date.now());
  assert.equal(r.status, "finished");
  assert.deepEqual(r.result, { reason: "last", winner: "p0" });
});

test("versus: a multiball extra that is missed is not replaced", () => {
  const r = room("versus");
  const missed = topMiss("p0");
  r.balls = [missed, { x: 180, y: 300, vx: 0, vy: 300, source: "p0" }, { x: 180, y: 300, vx: 0, vy: 300, source: "p1" }];
  advanceBall(r, missed, .01);
  assert.equal(r.balls.length, 2);
  assert.ok(r.balls.every(b => !(b.hold > 0)));
});

test("coop: the misser serves the one ball; if they are out, a teammate does; all out ends the round", () => {
  const r = room("coop");
  let missed = topMiss("p0");
  r.balls = [missed];
  advanceBall(r, missed, .01);
  assert.equal(r.balls.length, 1);
  assert.equal(r.balls[0].source, "p1");
  player(r, "p1").lives = 1;
  missed = topMiss("p1");
  r.balls = [missed];
  advanceBall(r, missed, .01);
  assert.equal(r.balls[0].source, "p0");
  BrickRoom.prototype.step.call(handler(r), .05, Date.now());
  assert.equal(r.status, "playing", "coop continues while anyone is alive");
  player(r, "p0").lives = 0;
  BrickRoom.prototype.step.call(handler(r), .05, Date.now());
  assert.equal(r.status, "finished");
  assert.deepEqual(r.result, { reason: "allout" });
});

test("a held ball launches along the player's own aim, relative to their screen", async () => {
  for (const seat of [0, 1, 2, 3]) {
    const speed = 300, v = aimVelocity(seat, .6, speed), [a, b, c, d] = viewMatrix(boardView(arenaLayout(), seat));
    // Rotated onto the player's screen, a positive aim goes up and to the right.
    assert.ok(a * v.vx + c * v.vy > 0 && b * v.vx + d * v.vy < 0, "seat " + seat);
    assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - speed) < 1e-9);
  }
  const r = room("versus");
  const socket = { deserializeAttachment: () => ({ id: "p0" }), send() {}, close() {} };
  await BrickRoom.prototype.webSocketMessage.call({ room: r, loop: {} }, socket, JSON.stringify({ type: "launch", version: 1, aim: 9 }));
  const mine = r.balls.find(b => b.source === "p0"), theirs = r.balls.find(b => b.source === "p1");
  assert.equal(mine.hold, 0);
  assert.ok(mine.vx > 0 && mine.vy < 0, "aim is clamped, not rejected");
  assert.ok(theirs.hold > 0);
});

test("players who stay disconnected past the grace period are out", () => {
  const r = room("versus");
  Object.assign(player(r, "p1"), { online: false, offlineAt: Date.now() - 31000 });
  BrickRoom.prototype.step.call(handler(r), .05, Date.now());
  assert.equal(player(r, "p1").lives, 0);
  assert.equal(r.status, "finished");
  assert.equal(r.result.winner, "p0");
});
