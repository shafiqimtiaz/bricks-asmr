import assert from "node:assert/strict";
import test from "node:test";
import { loadServer, makeRoom, roomInstance } from "./helpers.mjs";
import { arenaLayout, bricks } from "../src/game-core.mjs";

test("Arena geometry uses square cells and covers tall through ultrawide screens", () => {
  for (const ratio of [0.4, 375 / 812, 9 / 16, 3 / 4, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9]) {
    const arena = arenaLayout(ratio);
    assert.ok(Math.abs(arena.width / arena.height - ratio) < 0.002);
    assert.ok(arena.gridX >= 0 && arena.gridX + arena.cols * arena.cell <= arena.width);
    assert.ok(arena.gridY + arena.rows * arena.cell < 536, "bricks stay clear of the paddle");
    assert.equal(arena.cols % 2, 0);
    assert.equal(arena.rows % 2, 0);
    assert.ok(arena.cell >= 6);
  }
});

test("Shared generator reflows both Solo and 2–4-player boards deterministically", () => {
  for (const ratio of [0.45, 0.75, 1, 16 / 9, 21 / 9]) for (const players of [1, 2, 3, 4]) {
    const arena = arenaLayout(ratio);
    const board = bricks("qa-seed", players, arena);
    const other = bricks("qa-seed", players, arena);
    assert.deepEqual(board.arena, arena);
    assert.equal(board.hp.length, arena.cols * arena.rows);
    assert.equal(board.colors.length, board.hp.length);
    assert.equal(board.powerups.length, board.hp.length);
    assert.ok(board.total > 0, "arena must have playable bricks");
    assert.equal(board.total, board.hp.split("").filter(n => n !== "0").length);
    assert.equal(board.hp, other.hp);
    assert.equal(board.colors, other.colors);
    assert.ok(board.centerX >= arena.gridX && board.centerX <= arena.width - arena.gridX);
  }
});

const { spawnPlayerBall, startRound, advanceBall } = loadServer();

const server = loadServer();
const { E } = server;

test("Multiplayer spawn and authoritative wall collision respect room width", () => {
  for (const ratio of [9 / 16, 16 / 9, 21 / 9]) {
    const arena = arenaLayout(ratio);
    const S = E.create({ arena, board: bricks("qa", 2, arena), mode: "versus", set: "clean", lives: 4,
      players: [{ id: "left", seat: 1 }, { id: "right", seat: 3 }] });
    const [left, right] = S.balls;
    assert.ok(left.x < arena.width / 2 && left.vx === 0 && left.held);
    assert.ok(right.x > arena.width / 2 && right.held);
    assert.equal(left.y, 292);
    E.launch(S, "left");E.launch(S, "right");
    assert.ok(left.vx > 0 && right.vx < 0, "each serve heads inward from its own edge");
    // With nobody on the top and bottom edges they are walls.
    S.balls = [{ x: arena.width / 2, y: 60, vx: 0, vy: -250, owner: null, source: null }];
    for (let i = 0; i < 10; i++) E.step(S, 1 / 60);
    assert.ok(S.balls[0].vy > 0, "an empty edge reflects the ball");
    assert.ok(S.balls[0].y > 40 && S.balls[0].x === arena.width / 2);
  }
});

test("Authoritative 1–4-player rounds run across every arena shape", () => {
  for (const ratio of [0.46, 1, 16 / 9, 21 / 9]) for (const mode of ["coop", "versus"]) for (const playerCount of [2, 3, 4]) {
    const arena = arenaLayout(ratio);
    const room = makeRoom(server, mode, playerCount, "vapor");
    room.arena = arena;
    server.startRound(room, "vapor");
    assert.equal(room.status, "playing");
    assert.equal(room.sim.hp.length, arena.cols * arena.rows);
    assert.equal(room.sim.balls.length, mode === "coop" ? 1 : playerCount);
    const inst = roomInstance(server, room);
    for (const b of room.sim.balls) b.hold = 0;
    for (let tick = 0; tick < 100; tick++) inst.step(1 / 20, Date.now());
    for (const ball of room.sim.balls) {
      assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y));
      assert.ok(ball.x >= -11 && ball.x <= arena.width + 11);
    }
  }
});
