import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { aimDragAngle, aimPointerAngle, drawAimGuide, boardView, viewPoint, arenaLayout, browserCoreSource, soloCoreSource } from "../src/game-core.js";
import { soloHtml, multiHtml } from "./helpers.js";

function mockCanvas(){
 const ops=[];
 const context={
  save(){ops.push(["save"]);},
  restore(){ops.push(["restore"]);},
  beginPath(){},
  closePath(){},
  moveTo(x,y){ops.push(["move",x,y]);},
  lineTo(x,y){ops.push(["line",x,y]);},
  arc(x,y,r){ops.push(["circle",x,y,r]);},
  stroke(){},
  fill(){}
 };
 return {context,ops};
}

test("aim drag sensitivity depends on relative gesture length, not screen width",()=>{
 for(const [a,b] of [[80,320],[200,800],[350,1400]]){
  assert.ok(Math.abs(aimDragAngle(.1,a,b)-aimDragAngle(.1,100,400))<1e-10);
 }
 assert.ok(aimDragAngle(0,-80,320)<0);
 assert.ok(aimDragAngle(0,80,320)>0);
});

test("dragging the arrow points toward the finger in every player POV",()=>{
 const arena=arenaLayout(9/16);
 for(const seat of [0,1,2,3]){
  const view=boardView(arena,seat),origin=viewPoint(view,arena.width/2,500);
  assert.equal(aimPointerAngle(origin.x,origin.y,origin.x,origin.y-80),0);
  assert.ok(aimPointerAngle(origin.x,origin.y,origin.x+40,origin.y-80)>0);
  assert.ok(aimPointerAngle(origin.x,origin.y,origin.x-40,origin.y-80)<0);
  assert.equal(aimPointerAngle(origin.x,origin.y,origin.x+200,origin.y),1.15);
  assert.equal(aimPointerAngle(origin.x,origin.y,origin.x-200,origin.y),-1.15);
 }
});

test("the guide is anchored to the ball, fits a short preview and marks nearby bounces",()=>{
 const {context,ops}=mockCanvas();
 const pts=[];
 for(let i=1;i<=160;i++)pts.push(i*8,50);
 drawAimGuide(context,{pts,marks:[160,50,800,50]},"#fff",0,false,{x:0,y:50});
 assert.deepEqual(ops[0],["save"]);
 assert.deepEqual(ops.at(-1),["restore"]);
 const move=ops.find(x=>x[0]==="move");
 assert.deepEqual(move,["move",0,50]);
 const circles=ops.filter(x=>x[0]==="circle");
 assert.ok(circles.length>8);
 assert.ok(circles.some(x=>x[1]===160&&x[2]===50&&x[3]===5),"first bounce should be marked");
 assert.ok(!circles.some(x=>x[1]===800&&x[3]===5),"distant bounces stay out of the preview");
 for(const op of ops)if(op[0]==="circle"||op[0]==="move"||op[0]==="line"){
  assert.ok(op[1]>=-1&&op[1]<=391,"preview must not stretch across the court");
 }
});

test("flowing dots react to time and the origin ring responds to dragging",()=>{
 const pts=[8,40,16,40,24,40,32,40,40,40,48,40,56,40,64,40,72,40,80,40,88,40,96,40,104,40,112,40,120,40];
 const idle=mockCanvas(),moving=mockCanvas(),drag=mockCanvas();
 const preview={pts,marks:[]},ball={x:0,y:40};
 drawAimGuide(idle.context,preview,"#fff",0,false,ball);
 drawAimGuide(moving.context,preview,"#fff",500,false,ball);
 drawAimGuide(drag.context,preview,"#fff",500,true,ball);
 assert.notDeepEqual(idle.ops,moving.ops);
 const ring=drag.ops.find(x=>x[0]==="circle"&&x[1]===0&&x[2]===40);
 assert.ok(ring?.[3]>8);
});

test("empty paths render nothing",()=>{
 const {context,ops}=mockCanvas();
 drawAimGuide(context,{pts:[],marks:[]},"#fff");
 assert.equal(ops.length,0);
});

test("solo and multiplayer ship the same indicator and responsive gesture helper",()=>{
 for(const html of [soloHtml,multiHtml]){
  assert.match(html,/drawAimGuide\(ctx,/);
  assert.match(html,/aimDragAngle\(/);
  assert.doesNotMatch(html,/function drawPath\(/);
 }
 for(const source of [soloCoreSource,browserCoreSource]){
  assert.equal(runInNewContext(source+"\ntypeof drawAimGuide"),"function");
  assert.equal(runInNewContext(source+"\ntypeof aimDragAngle"),"function");
 }
});
