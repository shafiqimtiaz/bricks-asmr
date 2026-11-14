import assert from "node:assert/strict";
import test from "node:test";
import { arenaLayout, squareArena, bricks } from "../src/game-core.js";
import { soloHtml, multiHtml, soloWorker, serverSource } from "./helpers.js";

const configurations=[[1,arenaLayout()],[2,arenaLayout()],[3,squareArena()],[4,squareArena()]];

test("V3 produces 1,000 different deterministic board silhouettes across 1–4 players",()=>{
 for(const [players,arena] of configurations){
  const layouts=new Set(),families=new Set(),silhouettes=new Set();
  for(let i=0;i<250;i++){
   const seed="levels-"+i,board=bricks(seed,players,arena,3);
   assert.equal(board.generatorVersion,3);
   assert.notEqual(board.pattern,"fallback",seed+" ("+players+" players)");
   assert.deepEqual(board,bricks(seed,players,arena,3));
   assert.equal(board.hp.length,arena.cols*arena.rows);
   assert.equal(board.powerups.length,board.hp.length);
   assert.equal(board.total,[...board.hp].filter(v=>v==="1"||v==="2"||v==="3").length);
   assert.ok(board.hp.includes("4"),seed+" needs reflective walls");
   assert.ok(board.total>100);
   families.add(board.pattern);
   layouts.add(board.hp);
   silhouettes.add(board.hp.replace(/[0-3]/g,"0"));
  }
  assert.equal(layouts.size,250,"every level layout should differ");
  assert.ok(silhouettes.size>=200,"wall geometry should differ, not only brick colours");
  assert.deepEqual([...families].sort(),["domino","jackpot","needle","prison","serpent","twins"]);
 }
});

test("layout families have visibly different outer and internal wall compositions",()=>{
 const arena=arenaLayout(),byFamily=new Map();
 for(let i=0;i<150;i++){
  const b=bricks("levels-"+i,1,arena,3);
  const list=byFamily.get(b.pattern)||[];
  if(list.length<4)list.push(b.hp.replace(/[0-3]/g,"0"));
  byFamily.set(b.pattern,list);
 }
 assert.equal(byFamily.size,6);
 for(const [name,masks] of byFamily){
  assert.equal(new Set(masks).size,4,name+" must change wall geometry across seeds");
 }
});

test("V3 geometry covers phone, desktop and ultrawide courts without changing cell counts",()=>{
 for(const aspect of [.4,.46,9/16,1,16/9,32/9]){
  const arena=arenaLayout(aspect);
  for(const players of [1,2]){
   let fallbacks=0;
   for(let i=0;i<60;i++){
    const board=bricks("ratio"+i,players,arena,3);
    if(board.pattern==="fallback")fallbacks++;
    assert.equal(board.hp.length,arena.cols*arena.rows);
    assert.equal(board.total,[...board.hp].filter(x=>x>"0"&&x<"4").length);
   }
   assert.ok(fallbacks<=4,"unexpected fallbacks on "+aspect+" ("+players+" players)");
  }
 }
});

test("V1 is the new default while historical V2/V3 links remain available",()=>{
 for(const seed of ["ALPHA","TEST123","BRICKS"]){
  assert.deepEqual(bricks(seed,1),bricks(seed,1,arenaLayout(),1));
  assert.deepEqual(bricks(seed,1,arenaLayout(),2),bricks(seed,1,arenaLayout(),2));
 }
 assert.match(soloHtml,/let generatorVersion = .* : 1;/);
 assert.match(soloHtml,/generatorVersion=1;seed = randomSeed\(\)/);
 assert.match(soloHtml,/generatorVersion=1;startBoard\(\)/);
 assert.match(soloHtml,/generatorVersion>1\?'&v='\+generatorVersion:''/);
 assert.match(serverSource,/bricks\(r\.seed,r\.players\.length,r\.arena,1\)/);
 assert.match(multiHtml,/needle','prison','domino','serpent','jackpot','twins/);
 const key=new Function("return "+/const KEY=(\/.*?\/),ID=/.exec(soloWorker)[1])();
 for(const k of ["alpha-vintage","alpha-v2-vintage","alpha-v3-vintage","alpha-v3-vintage-a360"])
  assert.ok(key.test(k),k);
});
