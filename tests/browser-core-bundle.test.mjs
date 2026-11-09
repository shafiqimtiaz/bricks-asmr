import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { browserCoreSource, crusherInterval, soloCoreSource } from "../src/game-core.mjs";

test("Solo browser helpers include the crusher cadence used by the game loop", () => {
  const actual = runInNewContext(soloCoreSource + "\ncrusherInterval(1)");
  assert.equal(actual, crusherInterval(1));
});

test("Multiplayer browser helpers include the same crusher cadence", () => {
  const actual = runInNewContext(browserCoreSource + "\ncrusherInterval(1)");
  assert.equal(actual, crusherInterval(1));
});

test("Solo browser bundle provides the build-injected function name helper", () => {
  const result = runInNewContext(soloCoreSource + "\n__name((value) => value * 2, \"pickPU\")(21)");
  assert.equal(result, 42);
});

test("Multiplayer browser bundle provides the build-injected function name helper", () => {
  const result = runInNewContext(browserCoreSource + "\n__name((value) => value * 2, \"bounceBall\")(21)");
  assert.equal(result, 42);
});

test("Solo browser bundle can generate a brick board after serialization", () => {
  const result = runInNewContext(soloCoreSource + "\nbricks(\"qa-seed\", 1, 1).total");
  assert.ok(result > 0);
});
