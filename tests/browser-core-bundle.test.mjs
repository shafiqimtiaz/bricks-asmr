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
