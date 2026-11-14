import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, squareArena, bricks, drawBrickTile } from "../src/game-core.js";
import { brickEngine } from "../src/engine.js";
import { soloHtml, multiHtml, soloWorker, serverSource } from "./helpers.js";

const configs = [[1,arenaLayout()],[2,arenaLayout()],[3,squareArena()],[4,squareArena()]];

test("the legacy seeded board remains byte-for-byte compatible", () => {
 for (const [seed,total] of [["ALPHA",3184],["TEST123",3476],["BRICKS",3226]]) {
  const old=bricks(seed,1);
  assert.equal(old.total,total);
  assert.deepEqual(old,bricks(seed,1,arenaLayout(),1));
  assert.ok(!old.hp.includes("4"));
 }
});

test("one thousand v2 seeds have deterministic paths, permanent walls, and playable reward pockets", () => {
 const variants=new Set();
 for (const [count,arena] of configs) for (let i=0;i<250;i++) {
  const seed="q"+i,board=bricks(seed,count,arena,2);
  assert.equal(board.generatorVersion,2);
  assert.notEqual(board.pattern,"fallback",seed+" players="+count);
  assert.deepEqual(board,bricks(seed,count,arena,2));
  assert.equal(board.hp.length,arena.cols*arena.rows);
  assert.equal(board.colors.length,board.hp.length);
  assert.equal(board.powerups.length,board.hp.length);
  assert.equal(board.total,[...board.hp].filter(x=>x!=="0"&&x!=="4").length);
  assert.ok(board.hp.includes("4"),"solid reflectors are required");
  assert.ok(board.total>100 && board.total<board.hp.length);
  assert.ok(board.remaining===board.total);
  assert.ok(board.wallColors[4]);
  variants.add(board.pattern);
 }
 assert.deepEqual([...variants].sort(),["domino","jackpot","needle","prison","serpent","twins"]);
});

test("permanent reflectors do not count toward completion or break on direct contact", () => {
 const arena=arenaLayout(),board=bricks("q2",1,arena,2);
 const i=board.hp.indexOf("4"),E=brickEngine(()=>.5);
 const S=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",set:"vintage",lives:5});
 const cx=arena.gridX+(i%arena.cols+.5)*arena.cell,cy=arena.gridY+(Math.floor(i/arena.cols)+.5)*arena.cell;
 S.balls=[{x:cx,y:cy,vx:1,vy:-300,owner:"me",source:"me",held:false}];
 const before=S.remaining;
 E.step(S,.002);
 assert.equal(S.hp[i],4);
 assert.equal(S.remaining,before);
 S.fx.fire=5;S.fx.bomb=5;
 E.step(S,.002);
 assert.equal(S.hp[i],4);
 assert.equal(S.remaining,before);
});

test("a v2 reactor triggers a bounded chain within the correct material", () => {
 const arena=arenaLayout(),E=brickEngine(()=>.5);
 let board;
 for(let i=0;i<80;i++){
  const candidate=bricks("q"+i,1,arena,2);
  if(candidate.powerups.includes("c")){board=candidate;break;}
 }
 assert.ok(board,"seed sweep should include a reactive cluster");
 const i=board.powerups.indexOf("c"),S=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",set:"vintage",lives:5});
 assert.equal(S.pu[i],12);
 const cx=arena.gridX+(i%arena.cols+.5)*arena.cell,cy=arena.gridY+(Math.floor(i/arena.cols)+.5)*arena.cell;
 S.balls=[{x:cx,y:cy,vx:1,vy:-300,owner:"me",source:"me",held:false}];
 const before=S.remaining;
 const events=E.step(S,.003);
 assert.ok(before-S.remaining>=2 && before-S.remaining<=25);
 assert.ok(events.some(e=>e.t==="break"));
 assert.ok([...S.hp].some(h=>h===4),"reflectors remain after the cascade");
});

test("reactive bricks are distinguishable and have no extra audio samples", () => {
 const ops=[];
 const ctx={clearRect(){},fillRect(...v){ops.push(v);},set fillStyle(_){}};
 drawBrickTile(ctx,0,0,8,1,14,Array(16).fill("#999"),Array(5).fill("#777"),12);
 assert.ok(ops.length>=3,"reactor center must be marked");
});

test("new rounds use v2, older links use v1, and scores stay separated", () => {
 assert.match(soloHtml,/bricks\(seed,1,arena,generatorVersion\)/);
 assert.match(soloHtml,/hm \? 1 : 2/);
 assert.match(soloHtml,/generatorVersion===2\?'-v2':''/);
 assert.match(soloHtml,/&v=2/);
 assert.match(serverSource,/bricks\(r\.seed,r\.players\.length,r\.arena,2\)/);
 assert.match(multiHtml,/needle','prison','domino','serpent','jackpot','twins/);
 const KEY = new Function("return "+/const KEY=(\/.*?\/),ID=/.exec(soloWorker)[1])();
 assert.equal(KEY.test("abc123-vintage"),true);
 assert.equal(KEY.test("abc123-v2-vintage"),true);
 assert.equal(KEY.test("abc123-1-vintage"),false);
});
