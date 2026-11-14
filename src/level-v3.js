// Version 3 changes the silhouette of each board instead of reusing one central enclosure.
// Earlier generator versions are immutable so previously shared challenges still replay.
export function buildLevelV3(base, seed, players, arena, hashSeed, randomSeed) {
 const cols=arena.cols,rows=arena.rows,N=cols*rows;
 let l=cols,r=-1,t=rows,b=-1;
 for(let i=0;i<N;i++)if(base.hp[i]!=="0"){
  const x=i%cols,y=Math.floor(i/cols);
  l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
 }
 const w=r-l+1,h=b-t+1;
 if(w<12||h<6)return {...base,generatorVersion:3,pattern:"fallback"};
 const names=["needle","prison","domino","serpent","jackpot","twins"];
 const kind=hashSeed(seed+":v3:family")%6;
 const active=players===1?[0]:players===2?[0,2]:players===3?[0,2,1]:[0,2,1,3];
 const idx=(x,y)=>y*cols+x;
 const within=(x,y)=>x>=l&&x<=r&&y>=t&&y<=b;
 const clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
 const narrow=h<14;
 function make(attempt){
  const rng=randomSeed(hashSeed(seed+":v3:geometry:"+attempt));
  const prng=randomSeed(hashSeed(seed+":v3:rewards:"+attempt));
  const num=(a,z)=>a+rng()*(z-a),integer=(a,z)=>Math.floor(num(a,z+1));
  const hp=new Uint8Array(N),colors=new Uint8Array(N),pu=new Uint8Array(N),targets=[];
  const cell=(x,y,life,palette)=>{
   x=Math.round(x);y=Math.round(y);
   if(!within(x,y))return;
   const i=idx(x,y);hp[i]=life;
   colors[i]=life===4?0:life?(palette??2+integer(0,12)):0;
   if(!life||life===4)pu[i]=0;
  };
  const erase=(x,y)=>cell(x,y,0);
  const vertical=(x,a,z,span)=>{
   for(let y=Math.max(t,a);y<=Math.min(b,z);y++)
    for(let k=-Math.floor((span-1)/2);k<=Math.ceil((span-1)/2);k++)erase(x+k,y);
  };
  const horizontal=(y,a,z,span)=>{
   for(let x=Math.max(l,a);x<=Math.min(r,z);x++)
    for(let k=-Math.floor((span-1)/2);k<=Math.ceil((span-1)/2);k++)erase(x,y+k);
  };
  const blob=(cx,cy,rx,ry,shape=0)=>{
   return (x,y)=>{
    const dx=Math.abs((x-cx)/(rx||1)),dy=Math.abs((y-cy)/(ry||1));
    return shape===1?dx+dy<=1:shape===2?Math.max(dx,dy)<=1:shape===3?Math.pow(dx,4)+Math.pow(dy,4)<=1:dx*dx+dy*dy<=1;
   };
  };
  function patch(cx,cy,rx,ry,shape,fill=.7,palette=2+integer(0,12)){
   const inside=blob(cx,cy,rx,ry,shape);
   for(let y=Math.max(t,Math.floor(cy-ry-1));y<=Math.min(b,Math.ceil(cy+ry+1));y++)
    for(let x=Math.max(l,Math.floor(cx-rx-1));x<=Math.min(r,Math.ceil(cx+rx+1));x++)
     if(inside(x,y)&&rng()<fill)cell(x,y,rng()<.065?2:1,palette);
  }
  function ring(cx,cy,rx,ry,shape,gates,fill){
   const inside=blob(cx,cy,rx,ry,shape);
   const x0=Math.max(l,Math.floor(cx-rx-1)),x1=Math.min(r,Math.ceil(cx+rx+1));
   const y0=Math.max(t,Math.floor(cy-ry-1)),y1=Math.min(b,Math.ceil(cy+ry+1));
   let pocket=0;
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(!inside(x,y))continue;
    const edge=!inside(x+1,y)||!inside(x-1,y)||!inside(x,y+1)||!inside(x,y-1);
    if(edge)cell(x,y,4);
    else {cell(x,y,rng()<fill?(rng()<.08?2:1):0,2+(Math.floor(x/4)+Math.floor(y/5))%12);pocket++;}
   }
   for(const side of gates){
    const aperture=narrow?2:integer(2,4);
    if(side===0)vertical(Math.round(cx),Math.floor(cy+ry)-4,Math.ceil(cy+ry)+5,aperture);
    if(side===2)vertical(Math.round(cx),Math.floor(cy-ry)-5,Math.ceil(cy-ry)+4,aperture);
    if(side===1)horizontal(Math.round(cy),Math.floor(cx-rx)-5,Math.ceil(cx-rx)+4,aperture);
    if(side===3)horizontal(Math.round(cy),Math.floor(cx+rx)-4,Math.ceil(cx+rx)+5,aperture);
   }
   targets.push([Math.round(cx),Math.round(cy)]);
   return pocket;
  }
  function bar(x1,y1,x2,y2,gapPosition=.5){
   const dx=x2-x1,dy=y2-y1,steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
   const gap=Math.floor(steps*gapPosition);
   for(let k=0;k<=steps;k++){
    if(Math.abs(k-gap)<=2)continue;
    const u=k/Math.max(1,steps);
    cell(Math.round(x1+u*dx),Math.round(y1+u*dy),4);
   }
  }
  function cascade(cx,cy){
   const eligible=[];
   for(let y=cy-2;y<=cy+2;y++)for(let x=cx-2;x<=cx+2;x++){
    if(!within(x,y)||hp[idx(x,y)]===4)continue;
    cell(x,y,1,14);eligible.push(idx(x,y));
   }
   if(eligible.length>=7){
    const i=idx(cx,cy);
    if(hp[i]===1)pu[i]=12;
   }
  }

  // Breakable islands intentionally leave open sky. Their positions and shapes vary independently.
  const backgroundCount=narrow?3:kind===2?5:integer(3,6);
  for(let p=0;p<backgroundCount;p++){
   const cx=num(l+w*.12,r-w*.12),cy=num(t+h*.12,b-h*.12);
   const rx=num(Math.max(3,w*.08),Math.max(4,w*(kind===3?.22:.18)));
   const ry=num(Math.max(2,h*.09),Math.max(3,h*.22));
   patch(cx,cy,rx,ry,integer(0,3),num(.57,.88));
  }

  const xA=l+Math.round(w*num(.25,.38)),xB=l+Math.round(w*num(.62,.75));
  const yA=t+Math.round(h*num(.28,.42)),yB=t+Math.round(h*num(.58,.72));
  const rx=Math.max(4,Math.round(w*num(.14,.22)));
  const ry=Math.max(narrow?2:4,Math.round(h*num(.14,.22)));

  if(narrow){
   // Ultra-wide layouts have too few rows for a safe enclosure; use open galleries instead.
   const laneCount=h<=8?1:2;
   for(let j=0;j<laneCount;j++){
    const y=t+2+j*Math.max(3,Math.floor(h/2));
    bar(l+3,y,r-3,y, j%2?.23:.77);
    patch(l+w*num(.22,.38),t+h*.5,w*.13,Math.max(2,h*.3),2,.85);
    patch(l+w*num(.60,.78),t+h*.5,w*.13,Math.max(2,h*.3),kind%3,.88);
   }
   const ex=l+integer(3,Math.max(3,w-4));
   vertical(ex,t,b,2);
   targets.push([ex,Math.floor((t+b)/2)]);
  }else if(kind===0){ // Needle: a single offset octagon with a tiny entrance plus an opposite exit.
   const x=rng()<.5?xA:xB,y=rng()<.5?yA:yB;
   ring(x,y,rx,ry,3,[0,2],.82);
   patch(x===xA?xB:xA,y===yA?yB:yA,rx*.75,ry*.8,1,.86);
   bar(x===xA?xB-4:xA-4,t+3,x===xA?xB+4:xA+4,t+3,.63);
  }else if(kind===1){ // Prison: two detached chambers, not one continuous rectangular wall.
   const alongX=w>=h*.9;
   if(alongX){
    const rr=Math.max(4,Math.round(w*.13)),hh=Math.max(4,Math.round(h*.20));
    ring(xA,yA,rr,hh,0,[0,3],.67);
    ring(xB,yB,rr,hh,1,[2,1],.78);
   }else{
    const rr=Math.max(4,Math.round(w*.20)),hh=Math.max(4,Math.round(h*.13));
    ring(xA,yA,rr,hh,0,[0,1],.72);
    ring(xB,yB,rr,hh,1,[2,3],.72);
   }
  }else if(kind===2){ // Domino: diagonal brick islands separated by short, open reflector fins.
   const n=integer(3,5);
   for(let k=0;k<n;k++){
    const f=(k+.5)/n,flip=attempt%2?1:-1;
    const cx=l+Math.round(w*(.12+f*.76)),cy=t+Math.round(h*(.5+flip*(k%2?-.23:.23)));
    patch(cx,cy,Math.max(3,w/n*.57),Math.max(4,h*.16),k%3,.93,14);
    if(k%2===0)cascade(cx,cy);
    const fin=Math.max(3,Math.round(w/n*.25));
    bar(cx-fin,cy-6,cx-fin,cy+6,.22);
    bar(cx+fin,cy-6,cx+fin,cy+6,.78);
   }
   targets.push([Math.floor((l+r)/2),Math.floor((t+b)/2)]);
  }else if(kind===3){ // Serpent: alternating long reflective fins produce an open zig-zag course.
   const horizontalLanes=h>=w*.35;
   const n=horizontalLanes?integer(3,5):integer(3,5);
   for(let j=0;j<n;j++){
    if(horizontalLanes){
     const y=t+Math.round((j+1)*h/(n+1));
     const gapSide=j%2;
     bar(l+2,y,r-2,y,gapSide?.88:.12);
     patch(l+w*num(.30,.70),y+num(-3,3),Math.max(4,w*.13),Math.max(2,h/(n*4)),2,.8);
    }else{
     const x=l+Math.round((j+1)*w/(n+1));
     bar(x,t+2,x,b-2,j%2?.86:.14);
     patch(x+num(-4,4),t+h*num(.35,.65),Math.max(2,w/(n*4)),Math.max(4,h*.14),2,.85);
    }
   }
   targets.push([Math.floor((l+r)/2),Math.floor((t+b)/2)]);
  }else if(kind===4){ // Jackpot: a large off-centre open vault with a dense reward pocket.
   const x=rng()<.5?xA:xB,y=rng()<.5?yA:yB;
   ring(x,y,Math.max(5,Math.round(w*.23)),Math.max(5,Math.round(h*.24)),rng()<.5?1:3,[0,2,3],.92);
   patch(x===xA?xB:xA,y===yA?yB:yA,Math.max(4,w*.14),Math.max(3,h*.16),0,.83);
  }else{ // Twins: split vaults and a traversable bridge, with distinct door positions.
   const rr=Math.max(4,Math.round(w*.13)),hh=Math.max(4,Math.round(h*.21));
   ring(xA,t+Math.round(h*.38),rr,hh,3,[0,3],.70);
   ring(xB,t+Math.round(h*.62),rr,hh,0,[2,1],.74);
   horizontal(Math.floor((t+b)/2),xA+rr-2,xB-rr+2,3);
  }

  // Keep reachable launch lanes and a safe escape route; gateways never use a one-cell slot.
  const center=Math.floor((l+r)/2);
  if(players<=2){
   if(kind===0||kind===4)vertical(center,t,t+Math.max(3,Math.floor(h*.17)),2);
   else vertical(center,b-Math.max(3,Math.floor(h*.16)),b,3);
  }
  let remaining=0,walls=0;
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
   const i=idx(x,y);
   if(hp[i]===4){walls++;continue;}
   if(!hp[i])continue;
   remaining++;
   if(!pu[i]&&prng()<(players===1?.008:.012))pu[i]=integer(1,10);
  }
  for(const side of active){
   let selected=-1,best=Infinity;
   for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
    const i=idx(x,y);
    if(hp[i]!==1||pu[i])continue;
    const distance=side===0?b-y:side===2?y-t:side===1?x-l:r-x;
    const centerDistance=side===0||side===2?Math.abs(x-center):Math.abs(y-(t+b)/2);
    const cost=distance*8+centerDistance;
    if(cost<best){best=cost;selected=i;}
   }
   if(selected>=0)pu[selected]=11;
  }

  // Four-way reachability through eventual cleared bricks. Permanent walls alone cannot seal rewards.
  const seen=new Uint8Array(N),queue=new Int32Array(N);
  let head=0,tail=0;
  for(let x=l;x<=r;x++)for(const y of [t,b]){
   const i=idx(x,y);if(hp[i]!==4&&!seen[i]){seen[i]=1;queue[tail++]=i;}
  }
  for(let y=t;y<=b;y++)for(const x of [l,r]){
   const i=idx(x,y);if(hp[i]!==4&&!seen[i]){seen[i]=1;queue[tail++]=i;}
  }
  while(head<tail){
   const i=queue[head++],x=i%cols,y=Math.floor(i/cols);
   for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
    const xx=x+dx,yy=y+dy;
    if(!within(xx,yy))continue;
    const j=idx(xx,yy);if(seen[j]||hp[j]===4)continue;
    seen[j]=1;queue[tail++]=j;
   }
  }
  let blocked=0,brickReach=0;
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
   const i=idx(x,y);
   if(hp[i]===4)continue;
   if(hp[i]&&!seen[i])blocked++;
   if(hp[i]&&seen[i])brickReach++;
  }
  const usable=w*h,valid=remaining>=Math.min(100,Math.floor(usable*.18))&&walls>=Math.min(12,Math.floor(usable*.02))&&blocked===0;
  // Selecting the best *within a family* preserves recognisable silhouettes across seeds.
  const score=brickReach*.55+Math.min(walls,usable*.20)*.7;
  return {valid,score,hp,colors,pu,remaining,walls,targets};
 }
 let chosen=null;
 for(let attempt=0;attempt<3;attempt++){
  const item=make(attempt);
  if(item.valid&&(!chosen||item.score>chosen.score))chosen=item;
 }
 if(!chosen)return {...base,generatorVersion:3,pattern:"fallback"};
 let minX=cols,maxX=-1,minY=rows,maxY=-1;
 for(let i=0;i<N;i++)if(chosen.hp[i]){
  const x=i%cols,y=Math.floor(i/cols);
  minX=Math.min(minX,x);maxX=Math.max(maxX,x);
  minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 }
 return {...base,
  hp:Array.from(chosen.hp,x=>String(x)).join(""),
  colors:Array.from(chosen.colors,x=>x.toString(16)).join(""),
  powerups:Array.from(chosen.pu,x=>x.toString(16)).join(""),
  wallColors:[...base.wallColors.slice(0,4),"#5c7980"],
  vaporWalls:[...base.vaporWalls.slice(0,4),"#5c7980"],
  archetype:14+kind,pattern:names[kind],generatorVersion:3,quad:false,
  total:chosen.remaining,remaining:chosen.remaining,
  centerX:arena.gridX+(minX+maxX+1)*arena.cell/2,
  centerY:arena.gridY+(minY+maxY+1)*arena.cell/2
 };
}
