import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { aimDragAngle, drawAimGuide, browserCoreSource, soloCoreSource } from "../src/game-core.js";
import { soloHtml, multiHtml } from "./helpers.js";

function mockCanvas() {
 const ops=[];
 const context={
  save(){ops.push(["save"]);},
  restore(){ops.push(["restore"]);},
  beginPath(){ops.push(["begin"]);},
  closePath(){ops.push(["close"]);},
  moveTo(x,y){ops.push(["move",x,y]);},
  lineTo(x,y){ops.push(["line",x,y]);},
  arc(x,y,r){ops.push(["circle",x,y,r]);},
  stroke(){ops.push(["stroke"]);},
  fill(){ops.push(["fill"]);}
 };
 return {context,ops};
}

test("drag sensitivity stays the same on phone, tablet, and desktop",()=>{
 for(const [dx,width] of [[80,320],[200,800],[350,1400]]) {
  assert.ok(Math.abs(aimDragAngle(.1,dx,width)-aimDragAngle(.1,100,400))<1e-10);
 }
 assert.ok(aimDragAngle(0,-80,320)<0);
 assert.ok(aimDragAngle(0,80,320)>0);
});

test("minimal dotted path begins at held ball and ends after a short distance",()=>{
 const {context,ops}=mockCanvas(),pts=[];
 for(let i=1;i<=160;i++)pts.push(i*8,50);
 drawAimGuide(context,{pts,marks:[160,50,800,50]},"#fff",false,{x:0,y:50});
 const dots=ops.filter(x=>x[0]==="circle");
 assert.ok(dots.length>=10);
 assert.ok(dots.some(x=>x[1]===160&&x[2]===50&&x[3]===2.8),"first bounce gets an accent");
 assert.ok(!dots.some(x=>x[1]===800),"far bounces stay hidden");
 assert.ok(dots.every(x=>x[1]>=0&&x[1]<=260));
 assert.ok(!ops.some(x=>x[0]==="line"||x[0]==="move"||x[0]==="close"),"no line, arrowhead, or handle");
 assert.deepEqual(ops[0],["save"]);
 assert.deepEqual(ops.at(-1),["restore"]);
});

test("dragging strengthens the dots without adding an arrow",()=>{
 const pts=[];
 for(let i=1;i<=25;i++)pts.push(i*8,40);
 const quiet=mockCanvas(),drag=mockCanvas(),preview={pts,marks:[]},ball={x:0,y:40};
 drawAimGuide(quiet.context,preview,"#fff",false,ball);
 drawAimGuide(drag.context,preview,"#fff",true,ball);
 assert.equal(quiet.ops.filter(x=>x[0]==="circle").length,drag.ops.filter(x=>x[0]==="circle").length);
 assert.ok(!drag.ops.some(x=>x[0]==="close"||x[0]==="line"));
});

test("invalid or empty paths render nothing",()=>{
 const {context,ops}=mockCanvas();
 drawAimGuide(context,{pts:[],marks:[]},"#fff");
 assert.equal(ops.length,0);
});

test("solo and multiplayer use the same guide and one drag-to-aim interaction",()=>{
 for(const html of [soloHtml,multiHtml]){
  assert.match(html,/drawAimGuide\(ctx,/);
  assert.match(html,/aimDragAngle\(/);
  assert.doesNotMatch(html,/aimPointerAngle|aimOrigin|drag\.origin|function drawPath\(/);
 }
 for(const source of [soloCoreSource,browserCoreSource]){
  assert.equal(runInNewContext(source+"\ntypeof drawAimGuide"),"function");
  assert.equal(runInNewContext(source+"\ntypeof aimDragAngle"),"function");
 }
});
