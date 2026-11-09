import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
const server = source.slice(0, source.indexOf("const MULTIPLAYER_HTML="))
  .replace(/^import .*?;\s*/, "")
  .replace("export class BrickRoom", "class BrickRoom");
const { bricks, assignedSides, assignSides, startRound, advanceBall, BrickRoom } =
  new Function("DurableObject", server + ";return {bricks,assignedSides,assignSides,startRound,advanceBall,BrickRoom};")(class {});
const htmlStart = source.indexOf("const MULTIPLAYER_HTML=") + "const MULTIPLAYER_HTML=".length;
const htmlEnd = source.indexOf(";\nexport default", htmlStart);
const html = JSON.parse(source.slice(htmlStart, htmlEnd));

test("there is one board and each occupied player gets a unique side", () => {
  const expected = { 1: [0], 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };
  for (const count of [1, 2, 3, 4]) {
    const players = Array.from({ length: count }, (_, index) =>
      ({ id: "player-" + index, seat: -1, pos: .5, lives: 3, online: true }));
    assignSides(players);
    assert.deepEqual(players.map(player => player.seat), expected[count]);
    assert.deepEqual(assignedSides(count), expected[count]);
  }
  assert.equal((html.match(/<div id="wrap">/g) || []).length, 1);
  assert.equal((html.match(/id="c"/g) || []).length, 1);
});

test("multiplayer uses Solo's grid size and a deterministic level", () => {
  const first = bricks("TEST123", 1);
  assert.deepEqual(first, bricks("TEST123", 1));
  assert.equal(first.hp.length, 58 * 64);
  assert.equal(first.colors.length, first.hp.length);
  assert.equal(first.powerups.length, first.hp.length);
  assert.ok(first.palette.length === 16);
  assert.equal(first.total, [...first.hp].filter(digit => digit !== "0").length);
  assert.notEqual(first.hp, bricks("TEST123", 2).hp);
});

function roomForPlayers(count = 4) {
  const players = Array.from({ length: count }, (_, i) =>
    ({ id: "p" + i, seat: -1, pos: .5, lives: 3, score: 0, online: true, lastSeq: -1, lastInputAt: 0 }));
  assignSides(players);
  const room = { code: "BRICKS", players, status: "waiting", round: 0 };
  startRound(room);
  return room;
}

test("all four active paddles bounce their own ball", () => {
  for (const side of [0, 1, 2, 3]) {
    const room = roomForPlayers();
    const player = room.players.find(p => p.seat === side);
    player.pos = side === 0 || side === 2 ? .5 : 1;
    const ball = side === 0
      ? { x: 180, y: 531, vx: 0, vy: 330, owner: null }
      : side === 2
        ? { x: 180, y: 53, vx: 0, vy: -330, owner: null }
        : side === 1
          ? { x: 15, y: 500, vx: -330, vy: 0, owner: null }
          : { x: 345, y: 500, vx: 330, vy: 0, owner: null };
    room.balls = [ball];
    advanceBall(room, ball, .01);
    assert.equal(player.score, 2, "side " + side + " hit");
    assert.equal(ball.owner, player.id);
    assert.ok(side === 0 ? ball.vy < 0 : side === 2 ? ball.vy > 0 : side === 1 ? ball.vx > 0 : ball.vx < 0);
  }
});

test("a missed occupied paddle loses a life, an empty side acts as a wall", () => {
  const room = roomForPlayers(2);
  const top = room.players.find(p => p.seat === 2);
  const miss = { x: 30, y: 53, vx: 0, vy: -330, owner: null };
  room.balls = [miss];
  advanceBall(room, miss, .01);
  assert.equal(top.lives, 2);
  const left = { x: 15, y: 500, vx: -330, vy: 0, owner: null };
  room.balls = [left];
  advanceBall(room, left, .01);
  assert.ok(left.vx > 0);
  assert.equal(room.players.length, 2);
});

test("socket identity and sequence prevent controlling another paddle", async () => {
  const room = roomForPlayers(2);
  const handler = { room, loop: {}, ensureLoop() { throw Error("unexpected loop"); } };
  const socket = { deserializeAttachment: () => ({ id: "p0" }), send() {}, close() {} };
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 2, pos: .7, playerId: "p1"
  }));
  assert.equal(room.players[0].pos, .7);
  assert.equal(room.players[1].pos, .5);
  await BrickRoom.prototype.webSocketMessage.call(handler, socket, JSON.stringify({
    type: "paddle-input", version: 1, seq: 1, pos: .2
  }));
  assert.equal(room.players[0].pos, .7);
});

test("multiplayer renderer parses and Solo/leaderboard routes remain intact", () => {
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /paintTiles\(s\?\.board\)/);
  assert.match(js, /seq:\+\+inputSeq/);
  const solo = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8");
  assert.match(solo, /path==='\/api\/leaderboard'/);
  assert.match(solo, /const GAME=/);
});
