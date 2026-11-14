import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, squareArena, bricks } from "../src/game-core.js";
import { soloHtml, serverSource, soloWorker } from "./helpers.js";

test("V4 keeps all eight geometric families, 1,000 distinct boards and exact left-right symmetry",()=>{
 const configs=[[1,arenaLayout()],[2,arenaLayout()],[3,squareArena()],[4,squareArena()]];
 for(const [players,arena] of configs){
  const families=new Set(),layouts=new Set(),walls=new Set();
  let reactive=0,quad=0;
  for(let k=0;k<250;k++){
   const seed="hybrid-"+k,board=bricks(seed,players,arena,4);
   assert.equal(board.generatorVersion,4);
   assert.deepEqual(board,bricks(seed,players,arena,4));
   assert.equal(board.total,[...board.hp].filter(v=>v!=="0"&&v!=="4").length);
   assert.ok(board.hp.includes("4"),"permanent reflectors expected");
   assert.equal(board.hp.length,arena.cols*arena.rows);
   families.add(board.pattern);layouts.add(board.hp);walls.add(board.hp.replace(/[0-3]/g,"0"));
   if(board.powerups.includes("c"))reactive++;
   if(board.quad)quad++;
   for(let r=0;r<arena.rows;r++)for(let c=0;c<arena.cols/2;c++){
    const x=r*arena.cols+c,y=r*arena.cols+arena.cols-1-c;
    assert.equal(board.hp[x],board.hp[y],"brick symmetry "+seed);
    assert.equal(board.colors[x],board.colors[y],"colour symmetry "+seed);
    assert.equal(board.powerups[x],board.powerups[y],"reward symmetry "+seed);
   }
  }
  assert.equal(layouts.size,250);
  assert.ok(walls.size>=175,"reflective channel geometry must vary");
  assert.equal(families.size,8,"preserve original eight patterns");
  assert.ok(reactive>=40,"reactive pockets appear occasionally");
  assert.ok(quad>=25,"some boards also mirror vertically");
 }
});

test("new solo, daily and multiplayer rounds default to V4; old links still work",()=>{
 assert.match(soloHtml,/let generatorVersion = .* : hm \? 1 : 4;/);
 assert.match(soloHtml,/generatorVersion=4;seed = randomSeed\(\)/);
 assert.match(soloHtml,/generatorVersion=4;startBoard\(\)/);
 assert.match(soloHtml,/if\(generatorVersion>1\)url\.searchParams\.set\('v',String\(generatorVersion\)\)/);
 assert.match(serverSource,/bricks\(r\.seed,r\.players\.length,r\.arena,4\)/);
 assert.match(serverSource,/board:bricks\(code\.toLowerCase\(\),2,arena,4\),generatorVersion:4/);
 const KEY=new Function("return "+/const KEY=(\/.*?\/),ID=/.exec(soloWorker)[1])();
 for(const key of ["abc123-vintage","abc123-v2-vintage","abc123-v3-vintage","abc123-v4-vintage"])
  assert.ok(KEY.test(key),key);
});

test("V1, V2 and V3 remain byte-for-byte deterministic and version-specific",()=>{
 for(const version of [1,2,3]){
  const arena=arenaLayout(),board=bricks("historical",1,arena,version);
  assert.deepEqual(board,bricks("historical",1,arena,version));
 }
 assert.equal(bricks("ALPHA",1,arenaLayout(),1).total,3184);
 assert.match(soloHtml,/\[2,3,4\]\.includes\(Number\(new URLSearchParams\(location\.search\)\.get\('v'\)\)\)/);
 assert.match(soloHtml,/generatorVersion>1\?'&v='\+generatorVersion:''/);
});

test("V4 stays symmetric across phone, desktop and ultrawide arenas",()=>{
 for(const ratio of [.4,.46,9/16,1,16/9,32/9]){
  const arena=arenaLayout(ratio);
  for(const players of [1,2])for(let k=0;k<30;k++){
   const board=bricks("ratio-"+k,players,arena,4);
   assert.equal(board.hp.length,arena.cols*arena.rows);
   assert.equal(board.total,[...board.hp].filter(x=>x!=="0"&&x!=="4").length);
   for(let r=0;r<arena.rows;r++)for(let x=0;x<arena.cols/2;x++)
    assert.equal(board.hp[r*arena.cols+x],board.hp[r*arena.cols+arena.cols-1-x]);
  }
 }
});