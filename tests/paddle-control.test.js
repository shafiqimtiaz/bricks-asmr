import assert from "node:assert/strict";
import test from "node:test";
import { soloHtml, multiHtml } from "./helpers.js";

test("solo touch surface moves the paddle by finger delta without jumping", () => {
  const start = soloHtml.indexOf("// Touching the lower zone never jumps");
  const end = soloHtml.indexOf("const keys = {};", start);
  assert.ok(start > 0 && end > start);
  const listeners = {};
  const wrap = {
    addEventListener(type, callback) { listeners[type] = callback; },
    getBoundingClientRect() { return { width: 360 }; },
    setPointerCapture() {},
  };
  const me = { target: 180 };
  const positions = [];
  let launched = 0;
  const engine = {
    setPaddle(state, id, position) { me.target = position; positions.push(position); },
    setAim() {},
  };
  new Function("wrap", "audioInit", "toLogical", "paused", "aimAng", "E", "S", "me", "px", "pw",
    "W", "SZONE", "fx", "sensitivity", "state", "launch", "newBoard", "aimDragAngle",
    soloHtml.slice(start, end)
  )(wrap, () => {}, e => [e.clientX, e.clientY], false, 0, engine, {}, me, 180, 64, 360, 550,
    { invert: 0 }, () => .65, "aim", () => launched++, () => {}, () => 0);
  const event = (x, y = 580) => ({ pointerId: 1, target: { tagName: "CANVAS" }, clientX: x, clientY: y });
  listeners.pointerdown(event(100));
  assert.deepEqual(positions, [], "touch-down must not teleport the paddle");
  listeners.pointermove(event(160));
  assert.ok(Math.abs(me.target - 219) < 1e-9, "movement scales with finger delta and sensitivity");
  listeners.pointerup(event(160));
  listeners.pointerdown(event(320));
  assert.ok(Math.abs(me.target - 219) < 1e-9, "a new touch must preserve the old paddle position");
  listeners.pointercancel(event(320));
  listeners.pointermove(event(250));
  assert.equal(positions.length, 1, "cancelled drags must stop moving the paddle");
  listeners.pointerdown(event(180, 300));
  listeners.pointerup(event(180, 300));
  assert.equal(launched, 1, "tapping the court still launches without moving the paddle");
});

test("multiplayer lower surface uses the same no-jump delta, separate from serve aiming", () => {
  const start = multiHtml.indexOf("let controlDrag=null;");
  const end = multiHtml.indexOf("const MOVE_KEYS=", start);
  assert.ok(start > 0 && end > start);
  const listeners = {};
  const canvas = {
    addEventListener(type, callback) { listeners[type] = callback; },
    getBoundingClientRect() { return { width: 360 }; },
    setPointerCapture() {},
  };
  const positions = [];
  let launched = 0;
  const getPos = new Function("cv", "gcv", "state", "audioInit", "boardPointer", "viewH",
    "holdingServe", "sensitivity", "onMove", "setAim", "aimDragAngle", "launch",
    "let localPos=.5,drag=null,aimAng=0;const send=pos=>{localPos=pos;onMove(pos);};" +
    multiHtml.slice(start, end) + "return () => localPos;"
  )(canvas, canvas, { status: "playing" }, () => {}, e => ({ y: e.clientY }), 640,
    () => true, () => .65, pos => positions.push(pos), () => {}, () => 0, () => launched++);
  const event = (x, y = 580) => ({ pointerId: 2, clientX: x, clientY: y, currentTarget: canvas });
  listeners.pointerdown(event(100));
  assert.equal(getPos(), .5, "touch-down cannot move the paddle");
  listeners.pointermove(event(160));
  assert.ok(Math.abs(getPos() - (.5 + 60 / 360 * .65)) < 1e-9);
  listeners.pointerup(event(160));
  listeners.pointerdown(event(310));
  assert.equal(positions.length, 1, "a fresh touch cannot move the paddle");
  listeners.pointercancel(event(310));
  listeners.pointermove(event(250));
  assert.equal(positions.length, 1);
  listeners.pointerdown(event(180, 300));
  listeners.pointerup(event(180, 300));
  assert.equal(launched, 1, "board tap should still launch the held ball");
});

test("both modes share saved sensitivity levels and a paddle-width CRT indicator", () => {
  for (const html of [soloHtml, multiHtml]) {
    assert.match(html, /id="sensitivityToggle"/);
    assert.match(html, /SENS_VALUES=\[\.65,1,1\.35\]/);
    assert.match(html, /bricksPaddleSensitivity/);
    assert.match(html, /localStorage\.setItem\(SENS_KEY,String\(sensitivityLevel\)\)/);
    assert.match(html, /rgba\(139,171,154,\.10\)/);
    assert.doesNotMatch(html, /function sliderTo|trackStart=|SLIDE OR A \/ D/);
  }
  assert.match(soloHtml, /x<px\+pw\/2-1/);
  assert.match(multiHtml, /dotsX\+dotsW\/2-1/);
  assert.match(multiHtml, /viewPoint\(view,me\.seat===0/);
});
