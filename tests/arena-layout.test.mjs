import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { arenaLayout, bricks, crusherTransform, uncrushPoint, bounceBall } from "../src/game-core.mjs";

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

test("Multiplayer spawn and authoritative wall collision respect room width", () => {
  const source = readFileSync(new URL("../src/multi.mjs", import.meta.url), "utf8");
  const spawnStart = source.indexOf("function spawnPlayerBall(");
  const spawnEnd = source.indexOf("\nfunction resetBall(", spawnStart);
  const advanceStart = source.indexOf("function advanceBall(");
  const advanceEnd = source.indexOf("\nfunction clamp(", advanceStart);
  assert.ok(spawnStart > 0 && spawnEnd > spawnStart && advanceEnd > advanceStart);
  const spawn = new Function("arenaLayout", source.slice(spawnStart, spawnEnd) + "\nreturn spawnPlayerBall;")(arenaLayout);
  const advance = new Function(
    "crusherTransform", "uncrushPoint", "bounceBall",
    "const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));" +
      "const paddleFor=()=>null,grantPower=()=>{},damageBrick=()=>false,miss=()=>{};\n" +
      source.slice(advanceStart, advanceEnd) + "\nreturn advanceBall;"
  )(crusherTransform, uncrushPoint, bounceBall);

  for (const ratio of [9 / 16, 16 / 9, 21 / 9]) {
    const arena = arenaLayout(ratio);
    const room = { arena, board: bricks("qa", 1, 2, arena), players: [], crushSteps: 0, effects: {} };
    const leftPlayer = { seat: 1, pos: 0.5, id: "left" };
    const rightPlayer = { seat: 3, pos: 0.5, id: "right" };
    const leftBall = spawn(room, leftPlayer), rightBall = spawn(room, rightPlayer);
    assert.ok(leftBall.x < arena.width / 2);
    assert.ok(rightBall.x > arena.width / 2);
    assert.ok(rightBall.x > leftBall.x);
    const ball = { x: arena.width - 16, y: 500, vx: 250, vy: 0 };
    advance(room, ball, 0.04);
    assert.ok(ball.x < arena.width);
    assert.ok(ball.vx < 0, "right boundary should reflect the ball");
  }
});
