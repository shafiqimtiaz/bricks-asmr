import { aimVelocity, normalizeBallVelocity, crusherInterval, ballSpeed } from "./game-core.js";

// The one Bricks ASMR simulation, shared by Solo (in the browser) and Multiplayer (in the room).
// Solo is the one-player case: a single paddle on the bottom edge. Every paddle rule is written in the
// owning player's own frame, so a paddle on any edge plays exactly like Solo's.
// State is plain data (typed arrays included) so a room can store it; drawing and sound react to the
// events each call returns.
function brickEngine(rng=Math.random){
 const PU_SETS={
  clean:[
   {id:'plus3',ic:'+3',nm:'+3 BALLS',c:'#3fa9d8'},
   {id:'x3',ic:'×3',nm:'×3 SPLIT',c:'#9cc23a'},
   {id:'wide',ic:'W',nm:'WIDE',c:'#f0a040',t:12,own:1},
   {id:'fire',ic:'F',nm:'FIREBALL',c:'#ff5a2a',t:6},
   {id:'laser',ic:'L',nm:'LASER',c:'#e83a5a',t:8,own:1},
   {id:'floor',ic:'_',nm:'FLOOR',c:'#2ec4a6',t:8,own:1},
   {id:'bomb',ic:'B',nm:'BOMB BALLS',c:'#d9b22a',t:6},
   {id:'slow',ic:'S',nm:'SLOW-MO',c:'#6a8cff',t:8},
   {id:'shrink',ic:'-',nm:'SHRINK',c:'#8a2030',t:8,bad:1,own:1},
   {id:'life',ic:'♥',nm:'+1 LIFE',c:'#ff6fa3'}],
  vintage:[
   {id:'mitosis',ic:'M',nm:'MITOSIS',c:'#7be07b',t:10,own:1},
   {id:'nuke',ic:'N',nm:'NUKE',c:'#ffb000'},
   {id:'column',ic:'|',nm:'COLUMN BEAM',c:'#ff7a50'},
   {id:'rows',ic:'≡',nm:'ROW SWEEP',c:'#50c8ff'},
   {id:'ghost',ic:'G',nm:'GHOST',c:'#b8b8d8',t:8},
   {id:'twin',ic:'T',nm:'TWIN PADDLE',c:'#e0904a',t:10,own:1},
   {id:'hyper',ic:'»',nm:'HYPER',c:'#ff3df0',t:6},
   {id:'rain',ic:'R',nm:'BALL RAIN',c:'#7ad0ff'},
   {id:'soften',ic:'○',nm:'SOFTEN',c:'#a0a0a0'},
   {id:'time',ic:'-3',nm:'-3 SECONDS',c:'#ffe066',solo:1}],
  vapor:[
   {id:'prism',ic:'P',nm:'PRISM',c:'#b388ff'},
   {id:'chain',ic:'C',nm:'CHAIN',c:'#ff71ce',t:6},
   {id:'shock',ic:'◎',nm:'SHOCKWAVE',c:'#01cdfe'},
   {id:'mirror',ic:'||',nm:'MIRROR',c:'#05ffa1'},
   {id:'sunbeam',ic:'☀',nm:'SUN BEAM',c:'#ffd319',t:2,own:1},
   {id:'wobble',ic:'~',nm:'WOBBLE',c:'#9ff3ff',t:8},
   {id:'scan',ic:'▤',nm:'SCAN SWEEP',c:'#ff9de0'},
   {id:'lucky',ic:'7',nm:'LUCKY ×10',c:'#fffb96'},
   {id:'invert',ic:'⇄',nm:'INVERTED',c:'#7a1f5a',t:6,bad:1,own:1},
   {id:'freeze',ic:'❄',nm:'TIME FREEZE',c:'#bdf5ff',t:5,solo:1}]
 };
 const STARTER={clean:'x3',vintage:'rain',vapor:'prism'};
 const PU_BY_ID={};for(const k in PU_SETS)for(const d of PU_SETS[k])PU_BY_ID[d.id]=d;
 // Capsule kind 1–10 is the set's entry; 11 is the set's starter. Solo-only timer power-ups become SLOW-MO elsewhere.
 function puDef(set,k,mode='solo'){
  const d=k===11?PU_BY_ID[STARTER[set]]:PU_SETS[set][k-1];
  return d&&d.solo&&mode!=='solo'?PU_BY_ID.slow:d;
 }
 // Edge geometry. Seat 0 is the bottom edge (Solo's paddle), 2 the top, 1 the left and 3 the right.
 const PY=536,PH=7,GRACE=10,COMBO_WINDOW=.7,MILESTONES=[25,50,100,250,500,1000,2500,5000];
 const SIGN={0:1,2:-1,1:1,3:-1};
 const horizontal=seat=>seat===0||seat===2;
 function face(S,seat){return seat===0?PY:seat===2?48:seat===1?14:S.W-14;}
 function inward(seat){return seat===0?[0,-1]:seat===2?[0,1]:seat===1?[1,0]:[-1,0];}
 function along(seat,x,y){return horizontal(seat)?x:y;}
 // Edge tests are written as Solo writes them for the bottom edge (o = +1), so Solo stays bit-for-bit the same:
 // o is +1 where the outward direction is +x/+y, and q the coordinate across the edge.
 const OUT={0:1,2:-1,1:-1,3:1};
 function across(seat,x,y){return horizontal(seat)?y:x;}
 function edgeSpan(S,seat){return horizontal(seat)?[S.wx,S.W-S.wx]:[40,544];}
 // The point `d` pixels inside the edge (negative: beyond it).
 function point(S,seat,a,d){const q=face(S,seat)-OUT[seat]*d;return horizontal(seat)?{x:a,y:q}:{x:q,y:a};}
 function floorDepth(seat){return seat===0||seat===2?22:10;}

 function create(o){
  const a=o.arena,b=o.board,N=a.cols*a.rows;
  const hp=Uint8Array.from(b.hp,c=>c.charCodeAt(0)-48),col=Uint8Array.from(b.colors,c=>parseInt(c,16)),pu=Uint8Array.from(b.powerups,c=>parseInt(c,16));
  const rowCount=new Int16Array(a.rows),colCount=new Int16Array(a.cols);
  let minR=a.rows,maxR=-1,minC=a.cols,maxC=-1;
  for(let i=0;i<N;i++)if(hp[i]){const r=(i/a.cols)|0,c=i%a.cols;rowCount[r]++;colCount[c]++;minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
  const S={
   W:a.width,H:a.height,wx:a.square?6:0,CS:a.cell,COLS:a.cols,ROWS:a.rows,GX:a.gridX,GY:a.gridY,N,BR:a.cell*.45,PU_R:a.cell*1.5,speed:ballSpeed(a),
   mode:o.mode||'solo',set:o.set||'vintage',daily:!!o.daily,maxBalls:o.maxBalls||2500,holdSeconds:o.holdSeconds||0,
   hp,col,pu,rowCount,colCount,remaining:b.remaining,total:b.total,
   bounds:{X0:a.gridX+minC*a.cell,X1:a.gridX+(maxC+1)*a.cell,Y0:a.gridY+minR*a.cell,Y1:a.gridY+(maxR+1)*a.cell},
   seats:[...new Set(o.players.map(p=>p.seat))],
   crush:{clock:-GRACE,target:[0,0,0,0],off:[0,0,0,0],kx:1,bx:0,ky:1,by:0},
   status:'play',result:null,clock:0,
   pool:o.mode==='versus'?0:(o.lives??5),maxLives:o.maxLives??Infinity,
   fx:{},luckyLeft:0,laserCd:0,
   players:o.players.map(p=>({id:p.id,seat:p.seat,online:p.online!==false,out:false,lives:o.mode==='versus'?(o.lives??4):0,
    c:0,target:0,pw:0,aim:0,fx:{},score:0,combo:0,comboT:0,maxCombo:0,milestone:0})),
   balls:[],pups:[],lasers:[],misses:[]
  };
  for(const p of S.players){p.pw=basePaddle(S);const [lo,hi]=edgeSpan(S,p.seat);p.c=p.target=(lo+hi)/2;}
  const ev=[];
  if(S.mode==='solo'||S.mode==='coop'){const first=S.players.find(p=>p.id===o.server)||S.players[0];serve(S,first,ev);}
  else for(const p of S.players)serve(S,p,ev);
  return S;
 }
 const basePaddle=S=>64*S.CS/6;
 function alive(S,p){return !p.out&&(S.mode==='versus'?p.lives>0:S.pool>0);}
 function active(S,p){return p.online&&alive(S,p);}
 function bySeat(S,seat){return S.players.find(p=>p.seat===seat&&active(S,p))||null;}
 function player(S,id){return S.players.find(p=>p.id===id)||null;}
 function curSpeed(S){return S.speed*(S.fx.slow>0?.5:1)*(S.fx.hyper>0?2:1);}
 function paddles(S,p){if(!(p.fx.twin>0))return [p.c];const [lo,hi]=edgeSpan(S,p.seat);return [p.c,lo+hi-p.c];}
 function setVel(S,b,ang){const S0=curSpeed(S);b.vx=S0*Math.sin(ang);b.vy=-S0*Math.cos(ang);}
 function fixVel(S,b){normalizeBallVelocity(b,curSpeed(S),'y');}
 function heldSpot(S,p){const o=OUT[p.seat],q=face(S,p.seat)-o*S.BR-o;return horizontal(p.seat)?{x:p.c,y:q}:{x:q,y:p.c};}
 function serve(S,p,ev){
  p.aim=(rng()-.5)*.6;
  S.balls.push({...heldSpot(S,p),vx:0,vy:0,owner:p.id,source:p.id,held:true,hold:S.holdSeconds});
  ev.push({t:'serve',owner:p.id});
 }

 // The crusher grows the formation toward every occupied edge: toward one edge of a pair it slides,
 // toward both it stretches. World y = ky*gridY + by (and likewise for x).
 function updateTransform(S){
  const c=S.crush,o=c.off,B=S.bounds,has=s=>S.seats.includes(s);
  const axis=(lowSide,highSide,lo,hi)=>{
   const a=has(lowSide)?o[lowSide]:0,b=has(highSide)?o[highSide]:0;
   if(a&&b){const k=(hi-lo+a+b)/(hi-lo);return [k,lo-a-lo*k];}
   return [1,b-a];
  };
  [c.ky,c.by]=axis(2,0,B.Y0,B.Y1);
  [c.kx,c.bx]=axis(1,3,B.X0,B.X1);
 }
 function toWorld(S,x,y){const c=S.crush;return {x:c.kx*x+c.bx,y:c.ky*y+c.by};}
 // Grid column/row under a world coordinate. An unstretched axis uses Solo's exact arithmetic (v - G - offset).
 function colOf(S,x){const c=S.crush;return Math.floor((c.kx===1?x-S.GX-c.bx:(x-c.bx)/c.kx-S.GX)/S.CS);}
 function rowOf(S,y){const c=S.crush;return Math.floor((c.ky===1?y-S.GY-c.by:(y-c.by)/c.ky-S.GY)/S.CS);}
 // World position of a grid line, in Solo's order (G + offset + k*CS) when unstretched.
 function colX(S,c){const k=S.crush;return k.kx===1?S.GX+k.bx+c*S.CS:toWorld(S,S.GX+c*S.CS,0).x;}
 function rowY(S,r){const k=S.crush;return k.ky===1?S.GY+k.by+r*S.CS:toWorld(S,0,S.GY+r*S.CS).y;}
 function cellAt(S,x,y){
  const c=colOf(S,x),r=rowOf(S,y);
  if(c<0||c>=S.COLS||r<0||r>=S.ROWS)return -1;
  const i=r*S.COLS+c;return S.hp[i]?i:-1;
 }
 function solid(S,x,y){const i=cellAt(S,x,y);return i>=0&&S.fx.ghost>0&&S.col[i]===0?-1:i;}
 function cellCentre(S,i){const c=i%S.COLS,r=(i/S.COLS)|0;return {x:colX(S,c)+S.CS*S.crush.kx/2,y:rowY(S,r)+S.CS*S.crush.ky/2};}
 // How close the formation is to the given edge, in world pixels (negative once it has passed the line).
 function gap(S,seat){
  const {rowCount,colCount,ROWS,COLS,GX,GY,CS}=S;
  if(horizontal(seat)){
   let r=-1;
   if(seat===0){for(let k=ROWS-1;k>=0;k--)if(rowCount[k]>0){r=k;break;}if(r<0)return Infinity;return face(S,0)-10-rowY(S,r+1);}
   for(let k=0;k<ROWS;k++)if(rowCount[k]>0){r=k;break;}if(r<0)return Infinity;return rowY(S,r)-(face(S,2)+10);
  }
  let c=-1;
  if(seat===3){for(let k=COLS-1;k>=0;k--)if(colCount[k]>0){c=k;break;}if(c<0)return Infinity;return face(S,3)-10-colX(S,c+1);}
  for(let k=0;k<COLS;k++)if(colCount[k]>0){c=k;break;}if(c<0)return Infinity;return colX(S,c)-(face(S,1)+10);
 }

 let S=null,ev=null;
 function destroyCell(i,owner){if(S.hp[i]>0){S.hp[i]=1;hitCell(i,owner);}}
 function blast(c,r,rad,owner){for(let y=r-rad;y<=r+rad;y++)for(let x=c-rad;x<=c+rad;x++)if(x>=0&&x<S.COLS&&y>=0&&y<S.ROWS)destroyCell(y*S.COLS+x,owner);}
 // Clears every cell in the grid lines under the world band [lo,hi] ('x' = whole columns, 'y' = whole rows).
 function wipeBand(axis,lo,hi,owner){
  if(axis==='x'){const c0=Math.max(0,colOf(S,lo)),c1=Math.min(S.COLS-1,colOf(S,hi));for(let r=0;r<S.ROWS;r++)for(let c=c0;c<=c1;c++)destroyCell(r*S.COLS+c,owner);}
  else{const r0=Math.max(0,rowOf(S,lo)),r1=Math.min(S.ROWS-1,rowOf(S,hi));for(let r=r0;r<=r1;r++)for(let c=0;c<S.COLS;c++)destroyCell(r*S.COLS+c,owner);}
 }
 function wipeLine(axis,k,owner){
  for(let j=0;j<(axis==='row'?S.COLS:S.ROWS);j++)destroyCell(axis==='row'?k*S.COLS+j:j*S.COLS+k,owner);
  ev.push(axis==='row'?{t:'beam',y:rowY(S,k),h:S.CS*S.crush.ky,c:'#50c8ff'}:{t:'beam',x:colX(S,k),w:S.CS*S.crush.kx,c:'#50c8ff'});
 }
 function impact(i,owner){
  if(S.fx.bomb>0){blast(i%S.COLS,(i/S.COLS)|0,1,owner);return true;}
  if(S.fx.fire>0){destroyCell(i,owner);return false;}
  hitCell(i,owner);return true;
 }
 let inChain=false;
 function hitCell(i,owner){
  S.hp[i]--;
  const c=i%S.COLS,r=(i/S.COLS)|0,p=player(S,owner);
  if(S.hp[i]===0){
   S.remaining--;S.rowCount[r]--;S.colCount[c]--;
   ev.push({t:'break',i,r,c,owner});
   if(p){
    p.combo++;p.comboT=0;if(p.combo>p.maxCombo)p.maxCombo=p.combo;
    p.score+=10*(1+Math.min(4,Math.floor(p.combo/5)));
    if(p.milestone<MILESTONES.length&&p.combo>=MILESTONES[p.milestone])ev.push({t:'milestone',owner,n:MILESTONES[p.milestone++]});
   }
   if(S.pu[i]){
    const w=cellCentre(S,i),catcher=p&&active(S,p)?p:S.players.find(q=>active(S,q));
    if(catcher)S.pups.push({x:w.x,y:w.y,k:S.pu[i],c,r,owner:catcher.id});
    S.pu[i]=0;
   }
   if(S.luckyLeft>0&&S.balls.length<S.maxBalls){S.luckyLeft--;const w=cellCentre(S,i),nb={x:w.x,y:w.y,vx:0,vy:0,owner,source:owner};setVel(S,nb,(rng()-.5)*2.4);S.balls.push(nb);}
   if(S.fx.chain>0&&!inChain&&S.col[i]){
    inChain=true;const cc=S.col[i],q=[i],seen=new Set(q);let n=0;
    while(q.length&&n<40){const j=q.shift(),jc=j%S.COLS;
     for(const k of [jc>0?j-1:-1,jc<S.COLS-1?j+1:-1,j-S.COLS,j+S.COLS])if(k>=0&&k<S.N&&!seen.has(k)&&S.hp[k]>0&&S.col[k]===cc){seen.add(k);q.push(k);destroyCell(k,owner);n++;}}
    inChain=false;
   }
  }else{if(p)p.score+=3;ev.push({t:'hit',i,r,c,owner});}
 }
 function multiply(){
  const n=S.balls.length;
  for(let j=0;j<n&&S.balls.length<S.maxBalls;j++){
   const b=S.balls[j];if(b.held)continue;const a=Math.atan2(b.vx,-b.vy);
   for(const d of [-.42,.42]){if(S.balls.length>=S.maxBalls)break;const nb={x:b.x,y:b.y,vx:0,vy:0,owner:b.owner,source:b.source};setVel(S,nb,a+d);fixVel(S,nb);S.balls.push(nb);}
  }
 }
 function fromPaddle(p,angles){
  for(const d of angles){if(S.balls.length>=S.maxBalls)break;const nb={...heldSpot(S,p),owner:p.id,source:p.id,...aimVelocity(p.seat,d,curSpeed(S))};S.balls.push(nb);}
 }
 function applyPU(d,pup,p){
  if(d.t){if(d.own)p.fx[d.id]=d.t;else S.fx[d.id]=d.t;}
  const snap=S.balls.length,hz=horizontal(p.seat);
  switch(d.id){
   case 'plus3':fromPaddle(p,[-.35,0,.35]);break;
   case 'x3':multiply();break;
   case 'life':if(S.mode==='versus')p.lives=Math.min(S.maxLives,p.lives+1);else S.pool=Math.min(S.maxLives,S.pool+1);break;
   case 'nuke':blast(pup.c,pup.r,5,p.id);ev.push({t:'ring',x:pup.x,y:rowY(S,pup.r),R:40,c:'#ffb000'});break;
   case 'column':{const h=S.CS*1.5;wipeBand(hz?'x':'y',p.c-h,p.c+h,p.id);ev.push(hz?{t:'beam',x:p.c-h,w:h*2,c:'#ff7a50'}:{t:'beam',y:p.c-h,h:h*2,c:'#ff7a50'});break;}
   case 'rows':{
    const axis=hz?'row':'col',lines=[];
    for(let k=0;k<(hz?S.ROWS:S.COLS);k++)if(hz?S.rowCount[k]>0:S.colCount[k]>0)lines.push(k);
    for(let j=0;j<3&&lines.length;j++)wipeLine(axis,lines.splice(Math.floor(rng()*lines.length),1)[0],p.id);
    break;}
   case 'rain':{
    // Balls pour from the far side toward the catcher.
    const [lo,hi]=edgeSpan(S,p.seat),far=p.seat===0?S.GY+3:p.seat===2?540:p.seat===1?S.W-3:3;
    for(let j=0;j<20&&S.balls.length<S.maxBalls;j++){
     const a=lo+10+rng()*(hi-lo-20),nb=hz?{x:a,y:far}:{x:far,y:a};
     Object.assign(nb,{owner:p.id,source:p.id,...aimVelocity(p.seat,Math.PI+(rng()-.5)*1.2,curSpeed(S))});S.balls.push(nb);
    }
    break;}
   case 'soften':for(let i=0;i<S.N;i++)if(S.hp[i]>1){S.hp[i]=1;ev.push({t:'cell',i});}break;
   case 'time':ev.push({t:'time',ms:-3000});break;
   case 'prism':for(let j=0;j<snap&&S.balls.length<S.maxBalls;j++){const b=S.balls[j];if(b.held)continue;const a=Math.atan2(b.vx,-b.vy);
    for(const dd of [-.6,-.3,.3,.6]){if(S.balls.length>=S.maxBalls)break;const nb={x:b.x,y:b.y,vx:0,vy:0,owner:b.owner,source:b.source};setVel(S,nb,a+dd);fixVel(S,nb);S.balls.push(nb);}}break;
   case 'shock':for(let j=0;j<Math.min(snap,150);j++){const b=S.balls[j];blast(colOf(S,b.x),rowOf(S,b.y),2,p.id);ev.push({t:'ring',x:b.x,y:b.y,R:16,c:'#01cdfe'});}break;
   case 'mirror':for(let j=0;j<snap&&S.balls.length<S.maxBalls;j++){const b=S.balls[j];if(b.held)continue;
    S.balls.push(hz?{x:S.W-b.x,y:b.y,vx:-b.vx,vy:b.vy,owner:b.owner,source:b.source}:{x:b.x,y:584-b.y,vx:b.vx,vy:-b.vy,owner:b.owner,source:b.source});}break;
   case 'scan':{
    // The three lines of bricks nearest the catcher's edge.
    const n=hz?S.ROWS:S.COLS,count=hz?S.rowCount:S.colCount,near=p.seat===0||p.seat===3;let done=0;
    for(let k=0;k<n&&done<3;k++){const line=near?n-1-k:k;if(count[line]>0){wipeLine(hz?'row':'col',line,p.id);done++;}}
    break;}
   case 'lucky':S.luckyLeft+=10;break;
  }
 }

 function stepBalls(dt){
  const S0=curSpeed(S),steps=Math.ceil(S0*dt/2),sdt=dt/steps,BR=S.BR;
  const open=[0,1,2,3].map(seat=>!!bySeat(S,seat));
  for(let k=S.balls.length-1;k>=0;k--){
   const b=S.balls[k];
   if(b.held)continue;
   let dead=false;
   for(let s=0;s<steps;s++){
    let nx=b.x+b.vx*sdt;
    let i=solid(S,nx+Math.sign(b.vx)*BR,b.y);
    if(i>=0&&impact(i,b.owner)){b.vx=-b.vx;nx=b.x;}
    if(!open[1]&&nx<S.wx+BR){nx=S.wx+BR;b.vx=Math.abs(b.vx);}else if(!open[3]&&nx>S.W-S.wx-BR){nx=S.W-S.wx-BR;b.vx=-Math.abs(b.vx);}
    let ny=b.y+b.vy*sdt;
    i=solid(S,nx,ny+Math.sign(b.vy)*BR);
    if(i>=0&&impact(i,b.owner)){b.vy=-b.vy;ny=b.y;}
    if(!open[2]&&ny<S.GY-4+BR){ny=S.GY-4+BR;b.vy=Math.abs(b.vy);}
    else if(!open[0]&&ny>544-BR){ny=544-BR;b.vy=-Math.abs(b.vy);}
    for(const seat of [0,2,1,3]){
     const p=open[seat]?bySeat(S,seat):null;if(!p)continue;
     const o=OUT[seat],f=face(S,seat),out=o*(horizontal(seat)?b.vy:b.vx)>0;
     if(out&&o*across(seat,b.x,b.y)+BR<=o*f+2&&o*across(seat,nx,ny)+BR>=o*f){
      const a=along(seat,nx,ny);let hitPaddle=false;
      for(const q of paddles(S,p))if(a>q-p.pw/2-BR&&a<q+p.pw/2+BR){
       const off=Math.max(-1,Math.min(1,(a-q)/(p.pw/2)*SIGN[seat]));
       Object.assign(b,aimVelocity(seat,off*1.05,curSpeed(S)));
       if(horizontal(seat))ny=f-o*BR;else nx=f-o*BR;
       b.owner=p.id;p.score+=2;
       ev.push({t:'paddle',owner:p.id,seat});
       if(p.fx.mitosis>0&&S.balls.length<S.maxBalls)S.balls.push({x:nx,y:ny,owner:p.id,source:p.id,...aimVelocity(seat,-off*1.05+(rng()-.5)*.3,curSpeed(S))});
       hitPaddle=true;break;
      }
      if(hitPaddle)break;
     }
     const fl=f+o*floorDepth(seat);
     if(p.fx.floor>0&&o*(horizontal(seat)?b.vy:b.vx)>0&&o*across(seat,nx,ny)+BR>=o*fl){
      if(horizontal(seat)){ny=fl-o*BR;b.vy=-o*Math.abs(b.vy);}else{nx=fl-o*BR;b.vx=-o*Math.abs(b.vx);}
     }
    }
    b.x=nx;b.y=ny;
    if(b.x<-10||b.x>S.W+10||b.y<-10||b.y>S.H+10){dead=true;break;}
   }
   if(!dead){
    if(S.fx.wobble>0){const a=.06*Math.sin(S.clock*7+k*.7),ca=Math.cos(a),sa=Math.sin(a),vx=b.vx;b.vx=vx*ca-b.vy*sa;b.vy=vx*sa+b.vy*ca;}
    fixVel(S,b);
   }else{
    // The edge the ball left through decides who missed it.
    const seat=b.y>S.H+10?0:b.y<-10?2:b.x<-10?1:3,p=bySeat(S,seat)||player(S,b.owner);
    S.balls[k]=S.balls[S.balls.length-1];S.balls.pop();
    if(p)S.misses.push(p.id);
    ev.push({t:'miss',owner:p?.id??null,x:b.x,y:b.y});
   }
  }
 }
 function stepPowers(dt){
  for(let k=S.pups.length-1;k>=0;k--){
   const pup=S.pups[k],p=player(S,pup.owner);
   if(!p||!active(S,p)){S.pups.splice(k,1);continue;}
   const [ix,iy]=inward(p.seat);pup.x-=ix*95*dt;pup.y-=iy*95*dt;
   const o=OUT[p.seat],f=face(S,p.seat),q=o*across(p.seat,pup.x,pup.y),a=along(p.seat,pup.x,pup.y);
   if(q+S.PU_R>=o*f&&q-S.PU_R<=o*f+PH&&paddles(S,p).some(c=>Math.abs(a-c)<p.pw/2+S.PU_R)){
    const def=puDef(S.set,pup.k,S.mode);
    applyPU(def,pup,p);
    ev.push({t:'power',owner:p.id,id:def.id,k:pup.k,x:pup.x,y:pup.y});
    S.pups.splice(k,1);
   }else if(pup.x<-20||pup.x>S.W+20||pup.y<-20||pup.y>S.H+20)S.pups.splice(k,1);
  }
 }
 function stepLasers(dt){
  for(const p of S.players){
   if(!(p.fx.laser>0)||!active(S,p))continue;
   p.laserCd=(p.laserCd||0)-dt;
   if(p.laserCd<=0){p.laserCd=.12;for(const q of paddles(S,p))for(const a of [q-p.pw/2+3,q+p.pw/2-3])S.lasers.push({...point(S,p.seat,a,2),seat:p.seat,owner:p.id});}
  }
  for(let k=S.lasers.length-1;k>=0;k--){
   const L=S.lasers[k],[ix,iy]=inward(L.seat);let gone=false;
   for(let s=0;s<4&&!gone;s++){L.x+=ix*130*dt;L.y+=iy*130*dt;const i=cellAt(S,L.x+ix*3,L.y+iy*3);if(i>=0){hitCell(i,L.owner);gone=true;}}
   if(gone||L.y<S.GY-10||L.y>560||L.x<-10||L.x>S.W+10){S.lasers[k]=S.lasers[S.lasers.length-1];S.lasers.pop();}
  }
 }
 // Balls lost this step cost lives only when they leave the board short of its ball target:
 // one in Solo and Coop (sharing a pool of lives), one per player still standing in Versus.
 function settleMisses(){
  const target=()=>S.mode==='versus'?S.players.filter(p=>active(S,p)).length:1;
  while(S.misses.length&&S.balls.length<target()){
   const p=player(S,S.misses.shift());
   if(S.mode==='versus'){
    p.lives=Math.max(0,p.lives-1);ev.push({t:'life',owner:p.id,lives:p.lives});
    if(p.lives>0)serve(S,p,ev);
    else{S.balls=S.balls.filter(b=>!(b.held&&b.source===p.id));ev.push({t:'out',owner:p.id});}
   }else{
    S.pool--;ev.push({t:'life',owner:p.id,lives:S.pool});
    if(S.pool>0)serve(S,active(S,p)?p:S.players.find(q=>active(S,q)),ev);
   }
  }
  S.misses.length=0;
  // A player who came back online, or lost a teammate's serve, gets a ball when the board is short.
  while(S.status==='play'&&S.balls.length<target()){
   const own=q=>S.balls.filter(b=>b.source===q.id).length,next=S.players.filter(q=>active(S,q)).sort((a,b)=>own(a)-own(b))[0];
   if(!next)break;serve(S,next,ev);
  }
 }
 function finish(result){const cleared=result.reason==='cleared';S.status=cleared?'clear':'over';S.result=result;if(!cleared)S.pups=[];ev.push({t:'end',...result});}
 // Lives are settled after a clear is checked, as in Solo: clearing the last brick wins even if the ball is lost.
 function checkEnd(){
  if(S.status!=='play')return true;
  if(S.mode==='versus'){
   const standing=S.players.filter(p=>alive(S,p));
   if(standing.length<=1)return finish(standing.length?{reason:'last',winner:standing[0].id}:{reason:'allout'}),true;
  }else if(S.pool<=0)return finish({reason:'allout'}),true;
  return false;
 }

 function step(state,dt){
  S=state;ev=[];
  for(const p of S.players){
   const w=basePaddle(S)*(p.fx.wide>0?1.6:1)*(p.fx.shrink>0?.6:1),[lo,hi]=edgeSpan(S,p.seat);p.pw=w;
   p.c+=(p.target-p.c)*Math.min(1,dt*25);p.c=Math.max(lo+w/2,Math.min(hi-w/2,p.c));
  }
  for(const b of S.balls)if(b.held){
   const p=player(S,b.source);
   if(p)Object.assign(b,heldSpot(S,p));
   if(S.holdSeconds&&S.status==='play'){b.hold-=dt;if(b.hold<=0&&p)launchBall(b,p);}
  }
  if(S.status!=='play'||!S.balls.some(b=>!b.held)){settleMisses();checkEnd();return ev;}
  S.clock+=dt;
  for(const k in S.fx)if(S.fx[k]>0)S.fx[k]-=dt;
  for(const p of S.players)for(const k in p.fx)if(p.fx[k]>0)p.fx[k]-=dt;
  const c=S.crush;c.clock+=dt;
  if(c.clock>=crusherInterval(S.daily)){c.clock=0;for(const s of S.seats)c.target[s]+=S.CS;ev.push({t:'crush'});}
  for(const s of S.seats)c.off[s]+=(c.target[s]-c.off[s])*Math.min(1,dt*14);
  updateTransform(S);
  for(const p of S.players){p.comboT+=dt;if(p.comboT>COMBO_WINDOW){p.combo=0;p.milestone=0;}}
  for(const seat of S.seats){
   const p=bySeat(S,seat);
   if(p&&gap(S,seat)<=0){
    ev.push({t:'crushed',owner:p.id,seat});
    if(S.mode==='versus'){p.lives=0;p.out=true;S.balls=S.balls.filter(b=>!(b.held&&b.source===p.id));}
    else{finish({reason:'crushed'});return ev;}
   }
  }
  for(const p of S.players)if(p.fx.sunbeam>0&&active(S,p))wipeBand(horizontal(p.seat)?'x':'y',p.c-15,p.c+15,p.id);
  stepLasers(dt);
  stepBalls(dt);
  stepPowers(dt);
  if(S.remaining===0){finish({reason:'cleared'});return ev;}
  settleMisses();checkEnd();
  return ev;
 }
 function launchBall(b,p){b.held=false;b.hold=0;Object.assign(b,aimVelocity(p.seat,p.aim,curSpeed(S)));}
 function launch(state,id){
  S=state;const p=player(S,id);if(!p||S.status!=='play')return false;
  let any=false;for(const b of S.balls)if(b.held&&b.source===id){launchBall(b,p);any=true;}
  return any;
 }
 function holding(state,id){return state.balls.some(b=>b.held&&b.source===id);}
 function setAim(state,id,angle){const p=player(state,id);if(p)p.aim=Math.max(-1.15,Math.min(1.15,angle));}
 // Paddle target as a world coordinate along the player's edge.
 function setPaddle(state,id,centre){const p=player(state,id);if(p)p.target=centre;}
 // Maps a 0–1 slider position (0 = the player's own left) to a paddle centre.
 function paddleAt(state,id,t){
  const p=player(state,id);if(!p)return 0;
  const [lo,hi]=edgeSpan(state,p.seat),u=SIGN[p.seat]>0?t:1-t;
  return lo+p.pw/2+Math.max(0,Math.min(1,u))*(hi-lo-p.pw);
 }
 // The serve's predicted path: wall and brick bounces, then one return off the server's own paddle.
 function predict(state,id,maxSteps=900){
  S=state;const p=player(S,id),b=S.balls.find(v=>v.held&&v.source===id);
  if(!p||!b)return {pts:[],marks:[],hit:false};
  const S0=curSpeed(S),st=2/S0,pts=[],marks=[],fire=S.fx.fire>0,BR=S.BR,open=[0,1,2,3].map(s=>!!bySeat(S,s));
  let {x,y}=heldSpot(S,p),{vx,vy}=aimVelocity(p.seat,p.aim,S0),after=-1;
  for(let k=0;k<maxSteps;k++){
   let nx=x+vx*st;
   if(!fire&&solid(S,nx+Math.sign(vx)*BR,y)>=0){vx=-vx;nx=x;marks.push(x,y);}
   if(!open[1]&&nx<S.wx+BR){nx=S.wx+BR;vx=Math.abs(vx);marks.push(nx,y);}else if(!open[3]&&nx>S.W-S.wx-BR){nx=S.W-S.wx-BR;vx=-Math.abs(vx);marks.push(nx,y);}
   let ny=y+vy*st;
   if(!fire&&solid(S,nx,ny+Math.sign(vy)*BR)>=0){vy=-vy;ny=y;marks.push(nx,y);}
   if(!open[2]&&ny<S.GY-4+BR){ny=S.GY-4+BR;vy=Math.abs(vy);marks.push(nx,ny);}
   else if(!open[0]&&ny>544-BR){ny=544-BR;vy=-Math.abs(vy);marks.push(nx,ny);}
   const o=OUT[p.seat],f=face(S,p.seat);
   if(o*(horizontal(p.seat)?vy:vx)>0&&o*across(p.seat,x,y)+BR<=o*f+2&&o*across(p.seat,nx,ny)+BR>=o*f){
    const a=along(p.seat,nx,ny);
    for(const q of paddles(S,p))if(a>q-p.pw/2-BR&&a<q+p.pw/2+BR){
     const off=Math.max(-1,Math.min(1,(a-q)/(p.pw/2)*SIGN[p.seat]));
     ({vx,vy}=aimVelocity(p.seat,off*1.05,S0));if(horizontal(p.seat))ny=f-o*BR;else nx=f-o*BR;
     marks.push(nx,ny);after=0;break;
    }
   }
   x=nx;y=ny;
   if(k%4===0)pts.push(x,y);
   if(after>=0&&++after>110)break;
   if(OUT[p.seat]*across(p.seat,x,y)>OUT[p.seat]*face(S,p.seat)+PH+4)break;
   if(marks.length>16)break;
  }
  return {pts,marks,hit:after>=0};
 }
 // How far each occupied edge is from being crushed, in world pixels.
 function crushGap(state,seat){S=state;return gap(S,seat);}
 return {PU_SETS,PU_BY_ID,STARTER,puDef,PY,PH,create,step,launch,holding,setAim,setPaddle,paddleAt,predict,crushGap,paddles:(state,p)=>paddles(state,p),face:(state,seat)=>face(state,seat),floorDepth,point:(state,seat,a,d)=>point(state,seat,a,d),toWorld:(state,x,y)=>toWorld(state,x,y)};
}
export {brickEngine};
export const engineSource=brickEngine.toString();
