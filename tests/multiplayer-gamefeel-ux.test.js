import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, boardView, viewPoint } from "../src/game-core.js";
import { multiHtml } from "./helpers.js";

const rosterExpression=multiHtml.match(/const worldSide=([^;]+);const p=s\.players/)[1];
const labelExpression=multiHtml.match(/const side=([^;]+);/)[1];
const worldSeat=new Function("me","relativeSide","return "+rosterExpression);
const relativeSeat=new Function("p","view","return "+labelExpression);

test("roster and in-world opponent labels align with all four rotated cameras",()=>{
 const arena=arenaLayout(9/16),W=arena.width;
 const positions=[
  [W/2,544], [6,292], [W/2,40], [W-6,292]
 ];
 for(let viewer=0;viewer<4;viewer++){
  const camera=boardView(arena,viewer);
  for(let seat=0;seat<4;seat++){
   const relative=relativeSeat({seat},{seat:viewer});
   assert.ok(relative>=0&&relative<4);
   assert.equal(worldSeat({seat:viewer},relative),seat);
   const [x,y]=positions[seat],point=viewPoint(camera,x,y);
   const dx=point.x-camera.cx,dy=point.y-camera.cy;
   const side=Math.abs(dx)>Math.abs(dy)?(dx<0?1:3):(dy>0?0:2);
   assert.equal(relative,side,"viewer "+viewer+" seat "+seat);
  }
 }
 assert.match(multiHtml,/worldSide=\(me\.seat\+relativeSide\)%4/);
 assert.match(multiHtml,/side=\(p\.seat-view\.seat\+4\)%4/);
});

test("network loss is visible during play and input remains socket-gated",()=>{
 assert.match(multiHtml,/id="netStatus" role="status" aria-live="polite" hidden/);
 assert.match(multiHtml,/setConnection\("Reconnecting…","RECONNECTING"\)/);
 assert.match(multiHtml,/setConnection\("Opened elsewhere","SESSION OPEN ELSEWHERE"\)/);
 assert.match(multiHtml,/setConnection\("Live"\)/);
 assert.match(multiHtml,/socket\?\.readyState!==WebSocket\.OPEN\|\|state\?\.status!=="playing"/);
});

test("remote paddle visuals reset after round changes and use frame-independent easing",()=>{
 assert.match(multiHtml,/for\(const id of Object\.keys\(shownC\)\)delete shownC\[id\]/);
 assert.match(multiHtml,/prev\.seat!==p\.seat/);
 assert.match(multiHtml,/!prev\.online&&p\.online/);
 assert.match(multiHtml,/Math\.exp\(-dt\*18\)/);
 assert.match(multiHtml,/Math\.abs\(p\.c-seen\)<\.5/);
});

test("local paddle feedback is brief, isolated from physics, and respects reduced motion",()=>{
 assert.match(multiHtml,/paddlePulse=Math\.max\(0,paddlePulse-dt\*5\)/);
 assert.match(multiHtml,/prefers-reduced-motion: reduce/);
 assert.match(multiHtml,/paddlePulse=1/);
 assert.doesNotMatch(multiHtml,/hitStop|timeScale/);
});
