import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as core from "../src/game-core.js";
import { browserCoreSource, crusherInterval, soloCoreSource } from "../src/game-core.js";
import { engineSource } from "../src/engine.js";
import { multiHtml, serverSource, soloHtml } from "./helpers.js";

test("Solo browser helpers include the crusher cadence used by the game loop", () => {
  const actual = runInNewContext(soloCoreSource + "\ncrusherInterval()");
  assert.equal(actual, crusherInterval());
});

test("Multiplayer browser helpers include the same crusher cadence", () => {
  const actual = runInNewContext(browserCoreSource + "\ncrusherInterval()");
  assert.equal(actual, crusherInterval());
});

test("Solo browser bundle provides the build-injected function name helper", () => {
  const result = runInNewContext(soloCoreSource + "\n__name((value) => value * 2, \"pickPU\")(21)");
  assert.equal(result, 42);
});

test("Multiplayer browser bundle provides the build-injected function name helper", () => {
  const result = runInNewContext(browserCoreSource + "\n__name((value) => value * 2, \"aimVelocity\")(21)");
  assert.equal(result, 42);
});

test("Solo browser bundle can generate a brick board after serialization", () => {
  const result = runInNewContext(soloCoreSource + "\nbricks(\"qa-seed\", 1).total");
  assert.ok(result > 0);
});

test("every shared function a page calls is included in the bundle served with that page", () => {
  for (const [html, bundle] of [[soloHtml, soloCoreSource], [multiHtml, browserCoreSource]]) {
    const script = html.slice(html.indexOf("<script>"));
    for (const name of Object.keys(core)) {
      if (typeof core[name] !== "function" || !new RegExp("(?<![.\\w])" + name + "\\(").test(script)) continue;
      if (new RegExp("function " + name + "\\(").test(script)) continue;
      assert.equal(runInNewContext(bundle + "\ntypeof " + name), "function", name + " is missing from the browser bundle");
    }
  }
});

test("Multiplayer serves the shared engine with the core helpers it needs, as Solo does", () => {
  const kinds = runInNewContext(browserCoreSource + "\n" + engineSource + "\nconst E=brickEngine();[typeof E.predict,typeof E.paddleAt,typeof E.puDef,typeof E.face,typeof E.floorDepth,typeof E.point,typeof E.PU_BY_ID.slow].join()");
  assert.equal(kinds, "function,function,function,function,function,function,object");
  assert.match(serverSource, /browserCoreSource\+"\\n"\+engineSource/);
  const client = multiHtml.slice(multiHtml.indexOf("<script>"));
  assert.match(client, /const E=brickEngine\(\)/);
});
