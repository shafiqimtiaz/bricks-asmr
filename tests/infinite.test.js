import assert from "node:assert/strict";
import test from "node:test";
import { brickEngine } from "../src/engine.js";
import { arenaLayout, bricks } from "../src/game-core.js";

const arena=arenaLayout(9/16);
const make=(players=1,lives=5)=>{
 const E=brickEngine(()=>.5),board=bricks("liminal-infinite",players,arena,4);
 const members=players===1?[{id:"me",seat:0}]:[{id:"me",seat:0},{id:"guest",seat:2}];
 const S=E.create({arena,board,players:members,mode:players===1?"solo":"coop",set:"vintage",
  lives,infinite:true,holdSeconds:players===1?0:5,server:"me"});
 return {E,S,board};
};
const forceMiss=(E,S,seat=0)=>{
 const id=seat===0?"me":"guest";
 S.balls=[{x:180,y:seat===0?660:-20,vx:0,vy:seat===0?300:-300,owner:id,source:id}];
 return E.step(S,1/60);
};

test("infinite starts with a miss-based row counter, not a timer",()=>{
 const {E,S,board}=make();
 assert.equal(S.infinite,true);
 assert.deepEqual(S.descent,{rows:0});
 assert.ok(S.spawnC1>=S.spawnC0);
 const classic=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",lives:5});
 assert.equal(classic.descent,undefined);
});

test("no amount of waiting or aiming causes the board to descend",()=>{
 const {E,S}=make();
 const before=S.remaining;
 for(let i=0;i<60*30;i++)E.step(S,1/60);
 assert.equal(S.descent.rows,0);
 assert.equal(S.crush.target[0],0);
 assert.equal(S.remaining,before);
 assert.ok(E.holding(S,"me"));
});

test("losing a life advances exactly one row and replenishes Infinite",()=>{
 const {E,S}=make();
 const original=S.remaining,events=forceMiss(E,S);
 assert.equal(S.pool,4);
 assert.equal(S.descent.rows,1);
 assert.equal(S.crush.target[0],S.CS);
 assert.ok(events.some(e=>e.t==="life"));
 assert.ok(events.some(e=>e.t==="descent"&&e.rows===1));
 assert.ok(S.remaining>original,"miss-triggered new bricks arrive");
 for(let i=0;i<600;i++)E.step(S,1/60);
 assert.equal(S.descent.rows,1,"held ball does not cause more descent");
});

test("extra balls do not cost lives or move the formation",()=>{
 const {E,S}=make();
 S.balls=[{x:180,y:660,vx:0,vy:300,owner:"me",source:"me"},
 {x:180,y:300,vx:0,vy:300,owner:"me",source:"me"}];
 E.step(S,1/60);
 assert.equal(S.pool,5);
 assert.equal(S.descent.rows,0);
});

test("Infinite does not complete simply because its breakable bricks are cleared",()=>{
 const {E,S}=make();
 S.hp.fill(0);S.rowCount.fill(0);S.colCount.fill(0);S.remaining=0;
 for(let i=0;i<600;i++)E.step(S,1/60);
 assert.equal(S.status,"play");
 assert.equal(S.remaining,0);
 assert.equal(S.descent.rows,0);
});

test("the formation reaching the paddle still ends a run",()=>{
 const {E,S}=make();
 E.launch(S,"me");
 S.crush.target[0]=S.crush.off[0]=1000;
 E.step(S,1/60);
 assert.equal(S.status,"over");
 assert.equal(S.result.reason,"crushed");
});

test("two-player Infinite advances once per lost team life, not per elapsed time",()=>{
 const {E,S}=make(2,6);
 for(let i=0;i<60*12;i++)E.step(S,1/60);
 assert.equal(S.descent.rows,0);
 const events=forceMiss(E,S,0);
 assert.equal(S.pool,5);
 assert.equal(S.descent.rows,1);
 assert.equal(S.crush.target[0],S.CS);
 assert.equal(S.crush.target[2],S.CS);
 assert.ok(events.some(e=>e.t==="descent"));
 assert.ok(S.rowCount[0]===0,"extreme top row stays empty");
 assert.equal(S.status,"play");
});
