import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { bricks, infiniteOpeningBoard, arenaLayout, squareArena } from "../src/game-core.js";
import { brickEngine } from "../src/engine.js";
import { soloHtml, multiHtml, soloWorker, serverSource } from "./helpers.js";

const leaderboardHtml=readFileSync(new URL("../src/leaderboard.html",import.meta.url),"utf8");
const source=soloWorker.slice(soloWorker.indexOf("function json("),soloWorker.indexOf("export default"));
const api=new Function(source+"\nreturn api;")();
const uuid="123e4567-e89b-12d3-a456-426614174000";

test("Infinite opens high and centred without changing brick dimensions",()=>{
 for(const [players,arena] of [[1,arenaLayout()],[2,arenaLayout()],[3,squareArena()],[4,squareArena()]]){
  for(let i=0;i<100;i++){
   const seed="lim"+i,b=infiniteOpeningBoard(seed,arena,4,players);
   assert.equal(b.hp.length,arena.cols*arena.rows);
   assert.equal(b.colors.length,b.hp.length);
   assert.equal(b.powerups.length,b.hp.length);
   assert.equal(b.total,[...b.hp].filter(x=>x!=="0"&&x!=="4").length);
   assert.deepEqual(b,infiniteOpeningBoard(seed,arena,4,players));
   let maxRow=-1;
   for(let k=0;k<b.hp.length;k++)if(b.hp[k]!=="0")maxRow=Math.max(maxRow,Math.floor(k/arena.cols));
   const bottom=arena.gridY+(maxRow+1)*arena.cell;
   assert.ok(bottom<=(players===1?220:410),"Infinite opening leaves a meaningful gap");
   if(players===1)assert.ok(bottom<=225,"Solo starts well above the paddle");
   assert.equal(b.generatorVersion,4);
  }
 }
});

test("Infinite still descends on the timer while a held ball waits",()=>{
 const arena=arenaLayout(),board=infiniteOpeningBoard("held",arena,4,1);
 const E=brickEngine(()=>.5),S=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",infinite:true,lives:5});
 assert.deepEqual(S.descent,{t:0,rows:0,interval:8});
 for(let k=0;k<483;k++)E.step(S,1/60);
 assert.equal(S.descent.rows,1);
 assert.equal(S.crush.target[0],S.CS);
 assert.equal(S.pool,5);
});

test("new leaderboard supports swipeable time/score views while retaining the CRT",()=>{
 for(const html of [soloHtml,multiHtml]){
  assert.match(html,/#crt/);
  assert.match(html,/stageFit\(vw, vh, [A-Za-z]+, [A-Za-z]+, false\)/);
 }
 assert.match(leaderboardHtml,/id="bestTime"/);
 assert.match(leaderboardHtml,/id="bestScore"/);
 assert.match(leaderboardHtml,/touchstart/);
 assert.match(leaderboardHtml,/touchend/);
 assert.match(leaderboardHtml,/&metric='\+metric/);
 assert.match(soloHtml,/metric:'score'/);
 assert.match(soloHtml,/bricksBroken:lastBricks,bestCombo:lastCombo/);
});

test("Best Time and Best Score use separate world-ranked tables",async()=>{
 const sqls=[];
 const db={withSession(){return this},prepare(sql){
  sqls.push(sql);
  return {bind(){return this},async all(){return {results:[]}},async first(){return {n:0}},async run(){}};
 }};
 for(const metric of ["time","score"]){
  const url=new URL("https://example.com/api/leaderboard?scope=world&metric="+metric);
  const response=await api(new Request(url),{DB:db},url);
  assert.equal(response.status,200);
  const data=await response.json();assert.deepEqual(data.entries,[]);
 }
 assert.ok(sqls.some(s=>s.includes("FROM leaderboard_times ORDER BY best_ms ASC")));
 assert.ok(sqls.some(s=>s.includes("FROM leaderboard_scores ORDER BY best_score DESC")));
});

test("score saving records bricks and combo separately without a time",async()=>{
 const calls=[];
 const db={prepare(sql){return {bind(...args){this.args=args;return this},async run(){calls.push({sql,args:this.args})}}}};
 const url=new URL("https://example.com/api/leaderboard");
 const body={metric:"score",key:"high-v4-vintage",playerId:uuid,name:"Player One",score:12550,bricksBroken:567,bestCombo:27};
 const response=await api(new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),{DB:db},url);
 assert.equal(response.status,201);
 assert.equal(calls.length,2);
 assert.match(calls[0].sql,/INSERT INTO leaderboard_scores/);
 assert.deepEqual(calls[0].args,["high-v4-vintage",uuid,"Player One",12550,567,27]);
 assert.match(calls[1].sql,/UPDATE leaderboard_scores/);
 for(const bad of [{...body,score:-1},{...body,bestCombo:1.3},{...body,bricksBroken:-1}]){
  const res=await api(new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(bad)}),{DB:db},url);
  assert.equal(res.status,400);
 }
});

test("score ranking counts only brick breaks and combos, not paddle returns",()=>{
 const arena=arenaLayout(),board=bricks("brick-score",1,arena,4),E=brickEngine(()=>.5);
 const S=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",lives:5});
 const me=S.players[0];
 const i=S.hp.findIndex(v=>v===1);
 assert.ok(i>=0);
 const x=arena.gridX+(i%arena.cols+.5)*arena.cell,y=arena.gridY+(Math.floor(i/arena.cols)+.5)*arena.cell;
 S.balls=[{x,y,vx:0,vy:-300,owner:"me",source:"me",held:false}];
 E.step(S,.003);
 assert.ok(me.bricksBroken>=1);
 assert.ok(me.brickScore>=10);
 assert.ok(me.score>=me.brickScore);
 const before=me.brickScore;
 me.score+=2;
 assert.equal(me.brickScore,before,"non-brick points must not affect ranking score");
});

test("persisted rounds without new score counters recover on the next brick break",()=>{
 const arena=arenaLayout(),board=bricks("legacy-room",1,arena,4),E=brickEngine(()=>.5);
 const S=E.create({arena,board,players:[{id:"me",seat:0}],mode:"solo",lives:5});
 const player=S.players[0];
 delete player.brickScore;delete player.bricksBroken;
 const i=S.hp.findIndex(v=>v===1);
 assert.ok(i>=0);
 S.balls=[{
  x:arena.gridX+(i%arena.cols+.5)*arena.cell,
  y:arena.gridY+(Math.floor(i/arena.cols)+.5)*arena.cell,
  vx:0,vy:-300,source:"me",owner:"me",held:false
 }];
 E.step(S,.003);
 assert.ok(Number.isInteger(player.brickScore)&&player.brickScore>=10);
 assert.ok(Number.isInteger(player.bricksBroken)&&player.bricksBroken>=1);
});
