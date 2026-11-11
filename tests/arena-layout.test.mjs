import assert from "node:assert/strict";
import test from "node:test";
import { loadServer } from "./helpers.mjs";
import { arenaLayout, bricks, crusherInterval, crusherTransform, uncrushPoint, bounceBall } from "../src/game-core.mjs";

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
    const board = bricks("qa-seed", 1, players, arena);
    const other = bricks("qa-seed", 1, players, arena);
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

test("Multiplayer spawn and authoritative wall collision respect room width", () => {
  for (const ratio of [9 / 16, 16 / 9, 21 / 9]) {
    const arena = arenaLayout(ratio);
    const room = { arena, board: bricks("qa", 1, 2, arena), players: [], crushSteps: 0, effects: {} };
    const leftBall = spawnPlayerBall(room, { seat: 1, pos: 0.5, id: "left" });
    const rightBall = spawnPlayerBall(room, { seat: 3, pos: 0.5, id: "right" });
    assert.ok(leftBall.x < arena.width / 2 && leftBall.vx > 0);
    assert.ok(rightBall.x > arena.width / 2 && rightBall.vx < 0);
    assert.equal(leftBall.y, 292);
    const ball = { x: arena.width - 20, y: 500, vx: 250, vy: 0 };
    advanceBall(room, ball, 0.04);
    assert.ok(ball.x < arena.width);
    assert.ok(ball.vx < 0, "right boundary should reflect the ball");
  }
});

test("Authoritative 1–4-player rounds run across every arena shape", () => {
  for (const ratio of [0.46, 1, 16 / 9, 21 / 9]) for (const playerCount of [1, 2, 3, 4]) {
    const arena = arenaLayout(ratio);
    const room = {
      arena, code: "AAABBB",
      players: [0, 2, 1, 3].slice(0, playerCount)
        .map((seat, id) => ({ id: String(id), seat, pos: 0.5, lives: 3, score: 0, online: true })),
    };
    startRound(room);
    assert.equal(room.status, "playing");
    assert.equal(room.board.hp.length, arena.cols * arena.rows);
    assert.equal(room.balls.length, playerCount);
    for (let tick = 0; tick < 25; tick++) {
      for (const ball of [...room.balls]) advanceBall(room, ball, 1 / 60);
    }
    for (const ball of room.balls) {
      assert.ok(Number.isFinite(ball.x) && Number.isFinite(ball.y));
      assert.ok(ball.x >= 0 && ball.x <= arena.width);
    }
  }
});
