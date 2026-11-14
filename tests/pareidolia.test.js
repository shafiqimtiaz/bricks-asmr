import assert from "node:assert/strict";
import test from "node:test";
import { buildLevelV4 } from "../src/level-v4.js";
import { arenaLayout, squareArena, bricks, hash, random } from "../src/game-core.js";

const dense = (cols, rows, quad = false) => {
 const hp = Array.from({length:cols * rows},(_,i) => rows > 12 && (i < cols * 2 || i >= cols * (rows-2)) ? "0" : "1").join("");
 return {hp,colors:hp,powerups:"0".repeat(hp.length),quad,archetype:0,
  wallColors:["","#222","#333","#444"],vaporWalls:["","#222","#333","#444"],
  total:[...hp].filter(x=>x==="1").length};
};

test("every seeded mask has mirrored upper voids and a fragmented lower trace",()=>{
 const arena={cols:40,rows:50};
 for(const quad of [false,true])for(let k=0;k<30;k++){
  const board=buildLevelV4(dense(40,50,quad),"mask-"+k,1,arena,hash,random);
  const start=quad?25:2,height=47-start+1;
  let eyes=0,lower=0;
  for(let y=start+Math.floor(height*.18);y<=start+Math.ceil(height*.44);y++)
   for(let x=6;x<=15;x++)if(board.hp[y*40+x]==="0")eyes++;
  for(let y=start+Math.floor(height*.60);y<=start+Math.ceil(height*.87);y++)
   for(let x=10;x<=19;x++)if(board.hp[y*40+x]==="0")lower++;
  assert.ok(eyes>=2,"paired cavities absent: "+quad+" "+k);
  assert.ok(lower>=2,"lower trace absent: "+quad+" "+k);
  for(let y=0;y<50;y++)for(let x=0;x<20;x++)
   assert.equal(board.hp[y*40+x],board.hp[y*40+39-x]);
 }
});

test("squat wide-screen formations retain an abstract mirrored mask",()=>{
 const arena={cols:64,rows:10};
 const baseline=dense(64,10,true);
 for(let k=0;k<30;k++){
  const board=buildLevelV4(baseline,"short-"+k,2,arena,hash,random);
  let carved=0;
  for(let y=5;y<10;y++)for(let x=0;x<32;x++)
   if(board.hp[y*64+x]==="0")carved++;
  assert.ok(carved>=5,"no short mask for seed "+k);
  for(let y=0;y<10;y++)for(let x=0;x<32;x++){
   assert.equal(board.hp[y*64+x],board.hp[y*64+63-x]);
   assert.equal(board.hp[y*64+x],board.hp[(9-y)*64+x]);
  }
 }
});

test("pareidolia boards stay reproducible, breakable and symmetric in every player layout",()=>{
 const configurations=[[1,arenaLayout(.4)],[1,arenaLayout(16/9)],[2,arenaLayout(32/9)],[3,squareArena()],[4,squareArena()]];
 for(const [players,arena] of configurations)for(let k=0;k<25;k++){
  const seed="uncanny-"+k,board=bricks(seed,players,arena);
  assert.deepEqual(board,bricks(seed,players,arena));
  assert.equal(board.hp.length,arena.cols*arena.rows);
  assert.equal(board.total,[...board.hp].filter(x=>x!=="0"&&x!=="4").length);
  assert.ok(board.total>100);
  for(let y=0;y<arena.rows;y++)for(let x=0;x<arena.cols/2;x++){
   const i=y*arena.cols+x,j=y*arena.cols+arena.cols-1-x;
   assert.equal(board.hp[i],board.hp[j]);
   assert.equal(board.colors[i],board.colors[j]);
   assert.equal(board.powerups[i],board.powerups[j]);
  }
 }
});
