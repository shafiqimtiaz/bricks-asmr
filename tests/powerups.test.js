import assert from "node:assert/strict";
import test from "node:test";
import { brickEngine } from "../src/engine.js";

test("Rain is absent from every power-up set and starter capsule", () => {
  const engine = brickEngine();
  for (const [set, powers] of Object.entries(engine.PU_SETS)) {
    assert.equal(powers.length, 10, `${set} retains 10 power-up slots`);
    for (let kind = 1; kind <= 11; kind++) {
      const power = engine.puDef(set, kind);
      assert.ok(power, `${set} capsule ${kind} resolves to a power-up`);
      assert.notEqual(power.id, "rain");
    }
  }
  assert.equal(engine.puDef("vintage", 8).id, "slow");
  assert.equal(engine.puDef("vintage", 11).id, "slow");
  assert.equal(engine.puDef("vintage", 11, "versus").id, "slow");
});
