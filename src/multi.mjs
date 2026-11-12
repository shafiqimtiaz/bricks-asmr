import { DurableObject } from "cloudflare:workers";
import { arenaLayout, bricks, bounceBall, browserCoreSource, crusherInterval, crusherTransform, uncrushPoint, paddleShape, ballSpeed, aimVelocity, serveSpot } from "./game-core.mjs";
import MULTIPLAYER_HTML from "./multiplayer.html";
const ABC="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",TTL=21600000;
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
function reply(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extra}});}
function nameOf(v){if(typeof v!=="string")return "";const s=v.trim().normalize("NFKC");return /^[\p{L}\p{N} ._-]{2,18}$/u.test(s)?s:"";}
function cookieFor(code,t){return "brick_room_"+code+"="+t+"; Path=/; Max-Age=21600; HttpOnly; Secure; SameSite=Lax";}
function authToken(req,code){const raw=req.headers.get("cookie")||"",key="brick_room_"+code+"=";const v=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(key));return v?v.slice(key.length):"";}
function newToken(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");}

const MAX_BALLS=12;
const SEAT_ORDER=[0,2,1,3];
function assignedSides(n){return SEAT_ORDER.slice(0,n);}
function assignSides(players){
 const used=new Set();
 for(const p of players){
  if(!SEAT_ORDER.includes(p.seat)||used.has(p.seat)){
   p.seat=SEAT_ORDER.find(side=>!used.has(side));
   p.pos=.5;
  }
  used.add(p.seat);
 }
}

const POWER_LABELS={1:"MULTIBALL",2:"BALL SPLIT",3:"WIDE PADDLES",4:"PIERCE",5:"SHOCKWAVE",6:"+1 LIFE",7:"HYPER",8:"SLOW TIME",9:"CHAIN BLAST",10:"+1 LIFE",11:"STARTER SPLIT"};
const MODES=["coop","versus"],HOLD_SECONDS=5,OFFLINE_GRACE=30000,MAX_AIM=1.05;
function markEvent(r,type,x,y,owner=null){
 r.eventSeq=(r.eventSeq||0)+1;
 r.lastEvent={seq:r.eventSeq,type,x,y,owner};
}
function spawnPlayerBall(room,p){
 const arena=room.arena||arenaLayout();
 return {...serveSpot(arena,p.seat,p.pos),...aimVelocity(p.seat,p.aim||0,ballSpeed(arena)),owner:p.id,source:p.id};
}
function inPlay(p){return p.lives>0&&p.online!==false;}
function resetBall(room){
 room.balls=room.players.filter(inPlay).slice(0,MAX_BALLS).map(p=>spawnPlayerBall(room,p));
}
// Coop shares one ball; Versus keeps one ball per player still in play.
function ballTarget(r){return r.mode==="coop"?1:r.players.filter(inPlay).length;}
// A served ball rides the server's paddle while they aim, then launches. Whoever missed serves when they can.
function replenishBalls(room,preferred=null){
 const own=p=>room.balls.filter(b=>b.source===p.id).length;
 while(room.balls.length<Math.min(MAX_BALLS,ballTarget(room))){
  const candidates=room.players.filter(inPlay).sort((a,b)=>own(a)-own(b));
  const server=preferred&&inPlay(preferred)?preferred:candidates[0];
  if(!server)return;
  room.balls.push({...spawnPlayerBall(room,server),hold:HOLD_SECONDS});
  preferred=null;
 }
}
function launchBall(r,ball){
 const p=r.players.find(v=>v.id===ball.source);
 ball.hold=0;
 if(p)Object.assign(ball,aimVelocity(p.seat,p.aim||0,ballSpeed(r.arena)));
}
function eliminate(r,p){
 p.lives=0;
 r.balls=r.balls.filter(b=>!(b.source===p.id&&b.hold>0));
 replenishBalls(r);
}
function startRound(r){
 r.status="playing";r.round=(r.round||0)+1;r.seed=r.code.toLowerCase();r.level=r.round;
 r.mode=MODES.includes(r.mode)?r.mode:"versus";
 r.startedAt=Date.now()+3000;r.finishedAt=0;r.result=null;
 r.arena=r.arena||arenaLayout();
 r.board=bricks(r.seed,r.level,r.players.length,r.arena);r.hits=0;r.lastTouch=null;
 r.effects={wideUntil:0,pierceUntil:0,slowUntil:0,hyperUntil:0};
 r.eventSeq=0;r.lastEvent=null;r.crushClock=-10;r.crushSteps=0;r.pups=[];
 // Coop shares one pool of lives (3 per player); every player still in carries the same count.
 const lives=r.mode==="coop"?3*r.players.length:4;r.maxLives=r.mode==="coop"?lives+3:6;
 for(const p of r.players){p.score=0;p.combo=0;p.comboAt=0;p.lives=lives;p.pos=.5;p.aim=0;p.lastSeq=-1;p.lastInputAt=0;}
 r.balls=[];
 const host=r.players.find(p=>p.id===r.hostId);
 replenishBalls(r,host);
}
// Coop ends when the board is cleared or everyone is out; Versus when one player (or none) is left standing.
function finishCheck(r){
 const alive=r.players.filter(p=>p.lives>0);
 if(r.board.remaining===0)r.result={reason:"cleared"};
 else if(r.mode==="coop"?alive.length===0:alive.length<=1)r.result=alive.length?{reason:"last",winner:alive[0].id}:{reason:"allout"};
 else return false;
 r.status="finished";r.finishedAt=Date.now();
 return true;
}
function paddleFor(r,side){return r.players.find(p=>p.seat===side&&p.lives>0&&p.online!==false)||null;}
function damageBrick(r,index,owner,amount=1){
 const hp=r.board.hp.charCodeAt(index)-48;
 if(hp<=0)return false;
 const next=Math.max(0,hp-amount);
 r.board.hp=r.board.hp.slice(0,index)+next+r.board.hp.slice(index+1);
 if(next===0)r.board.remaining--;
 r.hits++;
 const player=r.players.find(p=>p.id===owner);
 if(player){
  // Bricks broken in quick succession build a combo; every five links add another multiple, up to x5.
  if(next===0){
   const now=Date.now();
   player.combo=now-(player.comboAt||0)<1500?(player.combo||0)+1:1;player.comboAt=now;
   player.score+=10*(1+Math.min(4,Math.floor(player.combo/5)));
  }else player.score+=3;
 }
 return next===0;
}
function createExtraBalls(r,ball,count){
 for(let i=0;i<count&&r.balls.length<MAX_BALLS;i++){
  const sign=i%2===0?1:-1,angle=sign*(.24+Math.floor(i/2)*.18);
  const cs=Math.cos(angle),sn=Math.sin(angle);
  r.balls.push({x:ball.x,y:ball.y,vx:ball.vx*cs-ball.vy*sn,vy:ball.vx*sn+ball.vy*cs,owner:ball.owner,source:ball.source??ball.owner,rally:ball.rally||0});
 }
}
function grantPower(r,idx,ball,caught=0){
 const {cols:GRID_COLS,rows:GRID_ROWS}=r.arena||(r.arena=arenaLayout());
 const kind=caught||parseInt(r.board.powerups?.[idx]||"0",16);
 if(!kind)return;
 const now=Date.now(),e=r.effects||(r.effects={wideUntil:0,pierceUntil:0,slowUntil:0,hyperUntil:0});
 if(kind===1||kind===2||kind===11){
  // A caught capsule splits the catcher's own ball (or, failing that, any ball in play).
  const from=ball.vx!==undefined?ball:r.balls.find(b=>b.source===ball.owner&&!(b.hold>0))||r.balls.find(b=>!(b.hold>0));
  if(from)createExtraBalls(r,from,kind===2?3:2);
 }
 else if(kind===3)e.wideUntil=now+12000;
 else if(kind===4)e.pierceUntil=now+7000;
 else if(kind===5||kind===9){
  const c=idx%GRID_COLS,row=Math.floor(idx/GRID_COLS),radius=kind===9?2:1;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   if(dx===0&&dy===0)continue;
   if(Math.abs(dx)+Math.abs(dy)>radius)continue;
   const x=c+dx,y=row+dy;
   if(x<0||x>=GRID_COLS||y<0||y>=GRID_ROWS)continue;
   damageBrick(r,y*GRID_COLS+x,ball.owner,kind===9?2:1);
  }
 }
 else if(kind===6||kind===10){
  const gainers=r.mode==="coop"?r.players.filter(x=>x.lives>0):r.players.filter(x=>x.id===ball.owner);
  for(const p of gainers)p.lives=Math.min(r.maxLives||6,p.lives+1);
 }
 else if(kind===7)e.hyperUntil=now+7000;
 else if(kind===8)e.slowUntil=now+7000;
 markEvent(r,POWER_LABELS[kind]||"POWER UP",ball.x,ball.y,ball.owner);
}
// As in Solo, a power-up brick releases a capsule. It falls toward the player whose ball broke the brick,
// and only takes effect if that player catches it.
function dropPower(r,idx,ball){
 const kind=parseInt(r.board.powerups?.[idx]||"0",16);
 if(!kind)return;
 const catcher=r.players.find(p=>p.id===ball.owner&&p.lives>0&&p.online!==false)||r.players.find(p=>p.id===ball.source&&p.lives>0&&p.online!==false);
 r.pups=r.pups||[];
 if(!catcher||r.pups.length>=16){grantPower(r,idx,ball);return;}
 r.pups.push({x:ball.x,y:ball.y,kind,idx,owner:catcher.id});
}
function advancePowers(r,dt){
 if(!r.pups?.length)return;
 const reach=r.arena.cell*1.5,wide=(r.effects?.wideUntil||0)>Date.now();
 r.pups=r.pups.filter(pup=>{
  const p=r.players.find(v=>v.id===pup.owner);
  if(!p||p.lives<=0||p.online===false)return false;
  const move=95*dt,shape=paddleShape(r.arena,p.seat,p.pos,wide);
  if(p.seat===0)pup.y+=move;else if(p.seat===2)pup.y-=move;else if(p.seat===1)pup.x-=move;else pup.x+=move;
  const depth=shape.horizontal?pup.y:pup.x,along=shape.horizontal?pup.x:pup.y,inward=p.seat===0||p.seat===3?-1:1;
  const past=(shape.face-depth)*inward;
  if(past<-reach)return true;
  if(past<=7+reach&&Math.abs(along-shape.center)<=shape.half+reach){
   grantPower(r,pup.idx,{x:pup.x,y:pup.y,owner:p.id},pup.kind);
   return false;
  }
  return past<=7+reach;
 });
}
function miss(r,p,ball){
 p.combo=0;
 if(r.mode==="coop"){for(const q of r.players)if(q.lives>0)q.lives--;}
 else p.lives=Math.max(0,p.lives-1);
 const index=r.balls.indexOf(ball);
 if(index!==-1)r.balls.splice(index,1);
 markEvent(r,"MISS",ball.x,ball.y,p.id);
 if(p.lives===0)eliminate(r,p);
 else replenishBalls(r,p);
}
function advanceBall(r,ball,dt){
 const {width,cell:GRID_SIZE,cols:GRID_COLS,rows:GRID_ROWS,gridX:GRID_X,gridY:GRID_Y}=r.arena||(r.arena=arenaLayout());
 const BOARD={x:6,y:40,right:width-6,bottom:544,paddleBottom:535,paddleTop:49,paddleLeft:15,paddleRight:width-15};
 const edge=Math.max(2.7,GRID_SIZE*.45),transform=crusherTransform(r.crushSteps,r.players,r.board.centerX,r.board.centerY);
 const impact=(x,y,axis)=>{
  const point=uncrushPoint(transform,x,y);
  const col=Math.floor((point.x-GRID_X)/GRID_SIZE),row=Math.floor((point.y-GRID_Y)/GRID_SIZE);
  if(col<0||col>=GRID_COLS||row<0||row>=GRID_ROWS)return false;
  const idx=row*GRID_COLS+col,life=r.board.hp.charCodeAt(idx)-48;
  if(life<=0)return false;
  const pierced=(r.effects?.pierceUntil||0)>Date.now();
  const cleared=damageBrick(r,idx,ball.owner,pierced?life:1);
  if(cleared)dropPower(r,idx,ball);
  if(!pierced)ball[axis]=-ball[axis];
  return !pierced;
 };
 const oldX=ball.x,oldY=ball.y;
 let nx=oldX+ball.vx*dt;
 if(ball.vx!==0&&impact(nx+Math.sign(ball.vx)*edge,oldY,"vx"))nx=oldX;
 ball.x=nx;
 let ny=oldY+ball.vy*dt;
 if(ball.vy!==0&&impact(nx,ny+Math.sign(ball.vy)*edge,"vy"))ny=oldY;
 ball.y=ny;
 const hit=(side,coord)=>{
  const p=paddleFor(r,side);if(!p)return false;
  // 2px of grace beyond the drawn paddle absorbs the latency between a player's hand and the room.
  const {half,center}=paddleShape(r.arena,side,p.pos,(r.effects?.wideUntil||0)>Date.now());
  if(Math.abs(coord-center)>half+edge+2){miss(r,p,ball);return true;}
  const deflect=clamp((coord-center)/half,-1,1);
  ball.owner=p.id;p.score+=2;
  // Every return speeds the ball up a little, to 30% at most; a miss starts the rally again.
  ball.rally=Math.min(10,(ball.rally||0)+1);
  bounceBall(ball,side,deflect,ballSpeed(r.arena)*(1+.03*ball.rally));
  return false;
 };
 if(ball.y>=BOARD.paddleBottom-edge&&ball.vy>0){
  ball.y=BOARD.paddleBottom-edge;if(hit(0,ball.x))return true;
  if(!paddleFor(r,0))ball.vy=-Math.abs(ball.vy);
 }else if(ball.y<=BOARD.paddleTop+edge&&ball.vy<0){
  ball.y=BOARD.paddleTop+edge;if(hit(2,ball.x))return true;
  if(!paddleFor(r,2))ball.vy=Math.abs(ball.vy);
 }
 if(ball.x<=BOARD.paddleLeft+edge&&ball.vx<0){
  ball.x=BOARD.paddleLeft+edge;if(hit(1,ball.y))return true;
  if(!paddleFor(r,1))ball.vx=Math.abs(ball.vx);
 }else if(ball.x>=BOARD.paddleRight-edge&&ball.vx>0){
  ball.x=BOARD.paddleRight-edge;if(hit(3,ball.y))return true;
  if(!paddleFor(r,3))ball.vx=-Math.abs(ball.vx);
 }
 return false;
}

function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
export class BrickRoom extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.room=null;this.loop=null;this.lastTick=0;this.lastSave=0;this.lastBroadcastCode=null;this.lastBroadcastRound=null;this.lastBroadcastHP=null;ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get("room")||null;if(this.room&&!this.room.arena)this.room.arena=arenaLayout();});}
 async save(){if(this.room){this.room.lastActivity=Date.now();await this.ctx.storage.put("room",this.room);}}
 liveIds(){return new Set(this.ctx.getWebSockets().filter(w=>w.readyState===1).map(w=>w.deserializeAttachment()?.id).filter(Boolean));}
 snapshot(includeBoard=true){
  const r=this.room,live=this.liveIds();
  const state={code:r.code,status:r.status,hostId:r.hostId,round:r.round||0,hits:r.hits||0,arena:r.arena||arenaLayout(),
   seed:r.seed,level:r.level,startedAt:r.startedAt,
   mode:r.mode||"versus",result:r.result||null,
   elapsed:r.startedAt?Math.max(0,Math.floor((((r.status==="finished"&&r.finishedAt)||Date.now())-r.startedAt)/1000)):0,
   players:r.players.map(p=>({id:p.id,name:p.name,seat:p.seat,pos:p.pos,score:p.score,lives:p.lives,combo:Date.now()-(p.comboAt||0)<1500?p.combo||0:0,online:live.has(p.id)})),
   balls:(r.balls||[]).map(b=>({x:Math.round(b.x*10)/10,y:Math.round(b.y*10)/10,vx:b.hold>0?0:Math.round(b.vx),vy:b.hold>0?0:Math.round(b.vy),owner:b.owner,source:b.source,held:b.hold>0||undefined})),
   pups:(r.pups||[]).map(p=>({x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,kind:p.kind,owner:p.owner})),
   now:Date.now(),effects:r.effects||{},lastEvent:r.lastEvent||null,crushSteps:r.crushSteps||0};
  if(includeBoard)state.board=r.board||null;
  return state;
 }
 broadcast(){
  if(!this.room)return;
  const r=this.room,state=this.snapshot(false);
  const full=this.lastBroadcastCode!==r.code||this.lastBroadcastRound!==(r.round||0)||!this.lastBroadcastHP;
  if(full)state.board=r.board||null;
  else if(r.board?.hp!==this.lastBroadcastHP)state.board={hp:r.board.hp,remaining:r.board.remaining};
  this.lastBroadcastCode=r.code;this.lastBroadcastRound=r.round||0;this.lastBroadcastHP=r.board?.hp||null;
  const data=JSON.stringify({type:"state",version:1,state});
  for(const ws of this.ctx.getWebSockets())if(ws.readyState===1)try{ws.send(data);}catch{}
 }
 async fetch(req){
  const parts=new URL(req.url).pathname.split("/").filter(Boolean),action=parts.at(-1),code=parts.at(-2);
  if(!/^[A-Z2-9]{6}$/.test(code||""))return reply({error:"Invalid room code"},400);
  if(action==="create"&&req.method==="POST"){
   if(this.room&&Date.now()-(this.room.lastActivity||0)<TTL)return reply({error:"Room already exists"},409);
   const data=await req.json().catch(()=>({})),name=nameOf(data.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const p={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5,score:0,lives:4};
   const arena=arenaLayout(Number(data.aspect));
   this.room={code,hostId:p.id,players:[p],status:"waiting",round:0,hits:0,balls:[],arena,board:bricks(code.toLowerCase(),1,2,arena),seed:code.toLowerCase(),level:1,startedAt:0,endsAt:0,lastActivity:Date.now()};assignSides(this.room.players);resetBall(this.room);
   await this.save();return reply({code,you:p.id},201,{"set-cookie":cookieFor(code,p.token)});
  }
  if(!this.room||this.room.code!==code||Date.now()-this.room.lastActivity>TTL)return reply({error:"Room not found or expired"},404);
  const r=this.room,existing=r.players.find(p=>p.token===authToken(req,code));
  if(action==="join"&&req.method==="POST"){
   if(existing)return reply({code,you:existing.id,resumed:true},200,{"set-cookie":cookieFor(code,existing.token)});
   if(r.status==="playing")return reply({error:"A round is in progress. Try again when it ends."},409);
   if(r.players.length>=4)return reply({error:"This lobby is full (4/4)"},409);
   const body=await req.json().catch(()=>({})),name=nameOf(body.name);if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
   const player={id:crypto.randomUUID(),token:newToken(),name,seat:0,pos:.5,score:0,lives:4};r.players.push(player);assignSides(r.players);
   if(r.status==="waiting"){r.board=bricks(r.seed||r.code.toLowerCase(),r.level||1,r.players.length,r.arena||arenaLayout());resetBall(r);this.lastBroadcastHP=null;}
   await this.save();this.broadcast();return reply({code,you:player.id,resumed:false},201,{"set-cookie":cookieFor(code,player.token)});
  }
  if(!existing)return reply({error:"Join the lobby first"},401);
  if(action==="rename"&&req.method==="POST"){
    const body=await req.json().catch(()=>({})),nextName=nameOf(body.name);
    if(!nextName)return reply({error:"Enter a name of 2–18 characters"},400);
    if(existing.name!==nextName){existing.name=nextName;await this.save();this.broadcast();}
    return reply({name:existing.name});
   }
   if(action==="state"&&req.method==="GET")return reply({you:existing.id,state:this.snapshot()});
  if(action==="socket"&&req.method==="GET"){
   if((req.headers.get("upgrade")||"").toLowerCase()!=="websocket")return reply({error:"WebSocket required"},426);
   const pair=new WebSocketPair(),[client,server]=Object.values(pair);for(const old of this.ctx.getWebSockets())if(old.deserializeAttachment()?.id===existing.id)try{old.close(1000,"Reconnected");}catch{}this.ctx.acceptWebSocket(server);server.serializeAttachment({id:existing.id});existing.lastSeq=-1;existing.online=true;
   if(r.status==="playing")replenishBalls(r);
    server.send(JSON.stringify({type:"hello",version:1,you:existing.id,state:this.snapshot()}));this.broadcast();if(r.status==="playing")this.ensureLoop();
   return new Response(null,{status:101,webSocket:client});
  }
  if(action==="action"&&req.method==="POST"){
   if(r.hostId!==existing.id)return reply({error:"Only the lobby host can start the game"},403);
   const body=await req.json().catch(()=>({}));if(body.action!=="start"&&body.action!=="mode")return reply({error:"Unknown action"},400);
   if(r.status!=="waiting"&&r.status!=="finished")return reply({error:"Round already active"},409);
   if(body.action==="mode"){
    if(!MODES.includes(body.mode))return reply({error:"Unknown mode"},400);
    r.mode=body.mode;await this.save();this.broadcast();return reply({ok:true});
   }
   const online=this.liveIds();if(r.players.filter(p=>online.has(p.id)).length<2)return reply({error:"At least two connected players are required"},409);
   for(const p of r.players)p.online=online.has(p.id);
   startRound(r);await this.save();this.broadcast();this.ensureLoop();return reply({ok:true});
  }
  if(action==="leave"&&req.method==="POST"){
   if(r.status==="playing"){
    if(existing.lives>0){eliminate(r,existing);markEvent(r,"OUT",0,0,existing.id);}
    if(r.hostId===existing.id){
     const online=this.liveIds();
     const nextHost=r.players.find(p=>p.id!==existing.id&&online.has(p.id))||r.players.find(p=>p.id!==existing.id);
     if(nextHost)r.hostId=nextHost.id;
    }
    if(finishCheck(r))this.stopLoop();
    await this.save();this.broadcast();
    return reply({ok:true,note:"Left the round"});
   }
   r.players=r.players.filter(p=>p.id!==existing.id);
   if(r.status==="waiting"&&r.players.length){
    assignSides(r.players);r.board=bricks(r.seed||r.code.toLowerCase(),r.level||1,Math.max(2,r.players.length),r.arena||arenaLayout());resetBall(r);this.lastBroadcastHP=null;
   }
   for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.id===existing.id)try{ws.close(1000,"Left lobby");}catch{}
   if(r.hostId===existing.id)r.hostId=r.players[0]?.id||null;
   if(!r.players.length){this.room=null;await this.ctx.storage.delete("room");}else await this.save();
   this.broadcast();return reply({ok:true},200,{"set-cookie":"brick_room_"+code+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
  }
  return reply({error:"Route not found"},404);
 }
 async webSocketMessage(ws,data){
  if(typeof data!=="string"||data.length>300||!this.room)return;
  const p=this.room.players.find(v=>v.id===ws.deserializeAttachment()?.id);
  if(!p){ws.close(1008,"Seat removed");return;}
  let v;try{v=JSON.parse(data);}catch{return;}
  if(v?.type==="paddle-input"&&v.version===1&&this.room.status==="playing"&&typeof v.pos==="number"&&Number.isFinite(v.pos)&&Number.isSafeInteger(v.seq)&&v.seq>(p.lastSeq??-1)){
   const now=Date.now();if(now-(p.lastInputAt||0)<25)return;
   p.pos=clamp(v.pos,0,1);p.lastSeq=v.seq;p.lastInputAt=now;
   if(typeof v.aim==="number"&&Number.isFinite(v.aim))p.aim=clamp(v.aim,-MAX_AIM,MAX_AIM);
   if(!this.loop)this.ensureLoop();
  }else if(v?.type==="launch"&&v.version===1&&this.room.status==="playing"){
   if(typeof v.aim==="number"&&Number.isFinite(v.aim))p.aim=clamp(v.aim,-MAX_AIM,MAX_AIM);
   for(const ball of this.room.balls||[])if(ball.source===p.id&&ball.hold>0)launchBall(this.room,ball);
  }else if(v?.type==="ping")ws.send(JSON.stringify({type:"pong"}));
 }
 async webSocketClose(ws,code,reason){try{ws.close(code,reason);}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id)){p.online=false;p.offlineAt=Date.now();}this.broadcast();if(this.liveIds().size===0){this.stopLoop();await this.save();}}}
 async webSocketError(ws){try{ws.close(1011,"Connection error");}catch{}if(this.room){const p=this.room.players.find(p=>p.id===ws.deserializeAttachment()?.id);if(p&&!this.liveIds().has(p.id)){p.online=false;p.offlineAt=Date.now();}this.broadcast();}}
 stopLoop(){if(this.loop!==null){clearInterval(this.loop);this.loop=null;}}
 ensureLoop(){
  if(this.loop!==null||!this.room||this.room.status!=="playing"||this.liveIds().size===0)return;
  this.lastTick=Date.now();this.lastSave=this.lastTick;
  this.loop=setInterval(()=>{
   if(!this.room||this.room.status!=="playing"||this.liveIds().size===0){this.stopLoop();return;}
   const now=Date.now(),dt=clamp((now-this.lastTick)/1000,0,.25);this.lastTick=now;
   this.step(dt,now);this.broadcast();
   if(now-this.lastSave>3000){this.lastSave=now;this.save().catch(e=>console.error("room.save",e));}
  },50);
 }
 step(dt,now){
  const r=this.room;
  if(!r.board)r.board=bricks(r.seed||r.code.toLowerCase(),r.level||1,r.players.length,r.arena||arenaLayout());
  r.balls=r.balls||[];
  // A player who stays disconnected past the grace period is out, so a round without a timer can still end.
  for(const p of r.players)if(p.lives>0&&p.online===false&&now-(p.offlineAt||now)>OFFLINE_GRACE)eliminate(r,p);
  replenishBalls(r);
  if(finishCheck(r)){this.stopLoop();this.save().catch(e=>console.error("room.finish",e));return;}
  if(now<r.startedAt)return;
  r.crushClock=(r.crushClock??-10)+dt;
  const interval=crusherInterval(r.level||1);
  if(r.crushClock>=interval){
   r.crushClock-=interval;r.crushSteps=(r.crushSteps||0)+1;
  }
  const count=Math.max(1,Math.ceil(dt/(1/120))),t=dt/count;
  for(let tick=0;tick<count;tick++){
   const effects=r.effects||{},slow=effects.slowUntil>now?.72:1,hyper=effects.hyperUntil>now?1.2:1;
   for(const ball of [...r.balls])if(r.balls.includes(ball)){
    if(ball.hold>0){
     ball.hold-=t;
     const owner=r.players.find(p=>p.id===ball.source);
     if(owner){const rest=spawnPlayerBall(r,owner);ball.x=rest.x;ball.y=rest.y;}
     if(ball.hold<=0)launchBall(r,ball);
    }else advanceBall(r,ball,t*slow*hyper);
   }
   advancePowers(r,t);
  }
  if(finishCheck(r)){this.stopLoop();this.save().catch(e=>console.error("room.finish",e));}
 }
}
function newCode(){const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);return Array.from(bytes,n=>ABC[n%ABC.length]).join("");}
function sameOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin;}
function htmlResponse(html){return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer","x-frame-options":"DENY"}});}

export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==="/"||path==="/multiplayer"||path==="/multiplayer/"||/^\/multiplayer\/[A-Z2-9]{6}\/?$/i.test(path))return htmlResponse(MULTIPLAYER_HTML.replace("<script>","<script>\n"+browserCoreSource+"\n"));
 if(!path.startsWith("/api/rooms/")&&path!=="/api/rooms")return reply({error:"Not found"},404);
 if((request.method==="POST"||request.headers.get("upgrade"))&&!sameOrigin(request))return reply({error:"Invalid origin"},403);
 if(request.method==="POST"&&Number(request.headers.get("content-length")||0)>1024)return reply({error:"Request too large"},413);
 if(path==="/api/rooms"&&request.method==="POST"){
  const body=await request.json().catch(()=>({})),name=nameOf(body.name);
  if(!name)return reply({error:"Enter a name of 2–18 characters"},400);
  for(let i=0;i<6;i++){const id=newCode(),stub=env.ROOMS.get(env.ROOMS.idFromName(id)),response=await stub.fetch(new Request("https://room.internal/api/rooms/"+id+"/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})}));if(response.status===409)continue;return response;}
  return reply({error:"Could not allocate a room"},503);
 }
 const match=/^\/api\/rooms\/([A-Z2-9]{6})\/(join|rename|state|socket|action|leave)$/.exec(path);
 if(!match)return reply({error:"Not found"},404);
 return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
}};