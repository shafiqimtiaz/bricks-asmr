import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, squareArena, bricks } from "../src/game-core.js";
import { soloHtml, serverSource } from "./helpers.js";

test("new solo and multiplayer levels restore the original horizontally mirrored geometry", () => {
 const sets = [[1,arenaLayout()],[2,arenaLayout()],[3,squareArena()],[4,squareArena()]];
 for (const [players,arena] of sets) {
  const archetypes = new Set(),layouts = new Set();
  for (let i=0;i<250;i++) {
   const seed="mirror-"+i,board=bricks(seed,players,arena);
   assert.deepEqual(board,bricks(seed,players,arena,1));
   archetypes.add(board.archetype);
   layouts.add(board.hp);
   assert.ok(!board.hp.includes("4"),"old breakable wall material remains unchanged");
   assert.equal(board.total,[...board.hp].filter(v=>v!=="0").length);
   for (let r=0;r<arena.rows;r++)for(let c=0;c<arena.cols/2;c++){
    const a=r*arena.cols+c,b=r*arena.cols+arena.cols-1-c;
    assert.equal(board.hp[a],board.hp[b],seed+" player count "+players+" row "+r);
    assert.equal(board.colors[a],board.colors[b],seed+" player count "+players+" row "+r);
   }
  }
  assert.equal(archetypes.size,8,"all original geometry families remain");
  assert.equal(layouts.size,250,"the original patterns still vary between seeds");
 }
});

test("new boards and daily challenges default to original geometry without version tags",()=>{
 assert.match(soloHtml,/let generatorVersion = .* : 1;/);
 assert.match(soloHtml,/generatorVersion=1;seed = randomSeed\(\)/);
 assert.match(soloHtml,/generatorVersion=1;startBoard\(\)/);
 assert.match(soloHtml,/if\(generatorVersion>1\)url\.searchParams\.set\('v',String\(generatorVersion\)\)/);
 assert.match(serverSource,/bricks\(r\.seed,r\.players\.length,r\.arena,1\)/);
 assert.match(serverSource,/board:bricks\(code\.toLowerCase\(\),2,arena,1\),generatorVersion:1/);
 assert.doesNotMatch(serverSource,/bricks\([^;\n]+,3\)/);
});

test("previous V2 and V3 share links retain their original deterministic layouts",()=>{
 for(const version of [2,3]){
  const arena=arenaLayout(),board=bricks("legacy",1,arena,version);
  assert.deepEqual(board,bricks("legacy",1,arena,version));
  assert.equal(board.generatorVersion,version);
 }
 assert.match(soloHtml,/\[2,3\]\.includes\(Number\(new URLSearchParams\(location\.search\)\.get\('v'\)\)\)/);
 assert.match(soloHtml,/generatorVersion>1\?'&v='\+generatorVersion:''/);
});
