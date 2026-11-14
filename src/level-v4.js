// Seeded symmetric refinements to the original eight geometric families.
export function buildLevelV4(base, seed, players, arena, hashSeed, randomSeed) {
 const cols=arena.cols, rows=arena.rows, size=cols*rows;
 const hp=Uint8Array.from(base.hp,Number);
 const color=Uint8Array.from(base.colors,x=>parseInt(x,16));
 const power=Uint8Array.from(base.powerups,x=>parseInt(x,16));
 let left=cols, right=-1, top=rows, bottom=-1;
 for(let i=0;i<size;i++)if(hp[i]){
  const x=i%cols,y=Math.floor(i/cols);
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const center=Math.floor((cols-1)/2);
 const lowerTop=base.quad?Math.ceil((top+bottom)/2):top;
 const inside=(x,y)=>x>=left&&x<=center&&y>=lowerTop&&y<=bottom;
 const index=(x,y)=>y*cols+x;
 const rng=randomSeed(hashSeed(seed+":v4:geometry"));
 const rand=(min,max)=>min+Math.floor(rng()*(max-min+1));
 const original=Uint8Array.from(hp);
 const runs=[];
 // Select existing geometric walls, not a new enclosing rectangle.
 for(let y=lowerTop+2;y<=bottom-2;y++){
  for(let x=left+2;x<=center-2;){
   if(original[index(x,y)]!==3){x++;continue;}
   const start=x;
   while(x<=center-2&&original[index(x,y)]===3)x++;
   if(x-start>=6)runs.push({horizontal:true,x:start,y,length:x-start});
  }
 }
 for(let x=left+2;x<=center-2;x++){
  for(let y=lowerTop+2;y<=bottom-2;){
   if(original[index(x,y)]!==3){y++;continue;}
   const start=y;
   while(y<=bottom-2&&original[index(x,y)]===3)y++;
   if(y-start>=6)runs.push({horizontal:false,x,y:start,length:y-start});
  }
 }
 const set=(x,y,life)=>{
  if(!inside(x,y))return;
  const i=index(x,y);
  hp[i]=life;
  if(!life){color[i]=0;power[i]=0;}
  else if(life===4){color[i]=0;power[i]=0;}
 };
 let reflectorCount=0,entrances=0;
 const used=[];
 const desired=rand(1,players>=3?3:4);
 // Different families inherit their original outlines, gaining only short reflective sections.
 for(let feature=0;feature<desired&&runs.length;feature++){
  let selection=null;
  for(let retry=0;retry<16;retry++){
   const run=runs[rand(0,runs.length-1)];
   const mid=(run.horizontal?run.x:run.y)+run.length/2;
   const px=run.horizontal?mid:run.x,py=run.horizontal?run.y:mid;
   if(used.every(p=>Math.hypot(p.x-px,p.y-py)>=9)){selection=run;used.push({x:px,y:py});break;}
  }
  if(!selection)break;
  const run=selection,span=Math.min(run.length,rand(9,17));
  const offset=rand(0,run.length-span);
  const aperture=rand(2,3);
  const gap=rand(3,Math.max(3,span-aperture-2));
  for(let k=0;k<span;k++){
   const x=run.horizontal?run.x+offset+k:run.x;
   const y=run.horizontal?run.y:run.y+offset+k;
   if(k>=gap&&k<gap+aperture){set(x,y,0);entrances++;}
   else if(original[index(x,y)]===3){set(x,y,4);reflectorCount++;}
  }
  // A short ball-sized continuation makes the entrance usable before the reward pocket is cleared.
  const depth=rand(2,3);
  for(let j=0;j<aperture;j++)for(let d=1;d<=depth;d++){
   const gate=offset+gap+j;
   if(run.horizontal)set(run.x+gate,run.y+(feature%2?-d:d),0);
   else set(run.x+(feature%2?-d:d),run.y+gate,0);
  }
 }
 // On sparse families without long straight walls, create a small open reflector channel.
 // It leaves both ends open, unlike a sealed, repetitive box.
 if(reflectorCount<5 && center-left>=9 && bottom-lowerTop>=10){
  const x=rand(left+4,center-4),y=rand(lowerTop+3,bottom-7);
  for(let d=0;d<7;d++){
   set(x,y+d,0);set(x+1,y+d,0);
   if(d>0&&d<6){set(x-1,y+d,4);set(x+2,y+d,4);reflectorCount+=2;}
  }
  entrances+=2;
 }
 // Rare bounded domino payoffs use the existing engine's 12-coded reactor mechanic.
 if(rng()<.48){
  for(let retry=0;retry<12;retry++){
   const x=rand(left+3,center-3),y=rand(lowerTop+3,bottom-3);
   let possible=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(inside(x+dx,y+dy)&&hp[index(x+dx,y+dy)]!==4)possible++;
   }
   if(possible<8)continue;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!inside(x+dx,y+dy)||hp[index(x+dx,y+dy)]===4)continue;
    const i=index(x+dx,y+dy);
    hp[i]=1;color[i]=14;power[i]=0;
   }
   const i=index(x,y);
   if(hp[i]===1&&color[i]===14)power[i]=12;
   break;
  }
 }
 // Seeded negative-space cues suggest a face without drawing one. Each family
 // keeps its underlying geometry; the symmetry turns small absences into a gaze.
 {
  const faceRandom=randomSeed(hashSeed(seed+":v4:pareidolia"));
  const faceInt=(a,b)=>a+Math.floor(faceRandom()*(b-a+1));
  const half=center-left+1, height=bottom-lowerTop+1;
  const compact=height<13;
  if(half>=8&&height>=4){
   const carve=(x,y)=>{
    if(!inside(x,y)||y<lowerTop+(compact?0:2)||y>bottom-(compact?0:3))return;
    const i=index(x,y);
    if(hp[i]===4)return;
    hp[i]=0;color[i]=0;power[i]=0;
   };
   const kind=faceInt(0,3);
   const eyeX=left+Math.round(half*(.48+faceRandom()*.16));
   const eyeY=lowerTop+Math.round(height*(.24+faceRandom()*.10));
   const eyeRX=Math.max(2,Math.round(half*(.12+faceRandom()*.06)));
   const eyeRY=Math.max(1,Math.round(height*(.035+faceRandom()*.03)));
   const tilt=(faceRandom()-.5)*1.2;
   for(let dx=-eyeRX;dx<=eyeRX;dx++)for(let dy=-eyeRY;dy<=eyeRY;dy++){
    const u=dx/eyeRX,v=(dy-tilt*u*eyeRY)/eyeRY;
    if(u*u+v*v>1.05||faceRandom()<.16)continue;
    if(Math.abs(u)<.45&&Math.abs(v)<.6&&faceRandom()<.28)continue;
    carve(eyeX+dx,eyeY+dy);
   }
   // Existing heavy bricks above the voids suggest a brow, not a drawn outline.
   for(let dx=-eyeRX;dx<=eyeRX;dx++)if(faceRandom()<.62){
    const x=eyeX+dx,y=eyeY-eyeRY-1+Math.round(tilt*dx/eyeRX);
    if(inside(x,y)){const i=index(x,y);if(hp[i]===1||hp[i]===2){hp[i]=3;color[i]=0;power[i]=0;}}
   }
   // Broken centre and lower slits emerge as surrounding bricks break.
   const bridgeX=center-faceInt(0,2);
   const bridgeEnd=lowerTop+Math.round(height*(.57+faceRandom()*.07));
   for(let y=eyeY+eyeRY+2;y<bridgeEnd;y++){
    if(faceRandom()<(.35+kind*.09))carve(bridgeX,y);
    if(faceRandom()<.12)carve(bridgeX-1,y);
   }
   const mouthY=lowerTop+Math.round(height*(.70+faceRandom()*.08));
   const mouthSpan=Math.max(3,Math.round(half*(.36+faceRandom()*.22)));
   const bend=[-2,1,2,-1][kind], stagger=faceRandom()*Math.PI;
   for(let dx=-mouthSpan;dx<=0;dx++){
    const u=-dx/mouthSpan;
    const y=mouthY+Math.round(bend*u*u+Math.sin(u*4+stagger)*.65);
    if(faceRandom()<.72-.22*u)carve(center+dx,y);
    if(kind===2&&faceRandom()<.24)carve(center+dx,y+1);
   }
  }
 }
 // Exact left-right symmetry is applied after every feature; four-way levels stay four-way.
 for(let y=lowerTop;y<=bottom;y++)for(let x=left;x<=center;x++){
  const a=index(x,y),b=index(cols-1-x,y);
  hp[b]=hp[a];color[b]=color[a];power[b]=power[a];
 }
 if(base.quad)for(let y=top;y<lowerTop;y++)for(let x=left;x<=right;x++){
  const a=index(x,bottom-(y-top)),b=index(x,y);
  hp[b]=hp[a];color[b]=color[a];power[b]=power[a];
 }
 // Some legacy families have colour metadata outside their occupied brick footprint.
 // Mirror the complete arrays, including empty cells, for exact deterministic symmetry.
 for(let y=0;y<rows;y++)for(let x=0;x<cols/2;x++){
  const a=index(x,y),b=index(cols-1-x,y);
  hp[b]=hp[a];color[b]=color[a];power[b]=power[a];
 }
 // Reflector-only flood fill: every breakable cell must remain accessible after clearing bricks.
 const seen=new Uint8Array(size),queue=new Int32Array(size);
 let head=0,tail=0;
 const enqueue=(x,y)=>{
  if(x<left||x>right||y<top||y>bottom)return;
  const i=index(x,y);
  if(seen[i]||hp[i]===4)return;
  seen[i]=1;queue[tail++]=i;
 };
 for(let x=left;x<=right;x++){enqueue(x,top);enqueue(x,bottom);}
 for(let y=top;y<=bottom;y++){enqueue(left,y);enqueue(right,y);}
 while(head<tail){
  const i=queue[head++],x=i%cols,y=Math.floor(i/cols);
  enqueue(x+1,y);enqueue(x-1,y);enqueue(x,y+1);enqueue(x,y-1);
 }
 let blocked=0,remaining=0,walls=0;
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const i=index(x,y);
  if(hp[i]===4){walls++;continue;}
  if(hp[i]&&!seen[i])blocked++;
  if(hp[i])remaining++;
 }
 // A conservative fallback preserves the original beautiful geometry instead of an unplayable vault.
 if(blocked||remaining<Math.max(40,Math.floor(base.total*.3))){
  for(let i=0;i<size;i++)if(hp[i]===4){hp[i]=3;color[i]=0;}
  remaining=Array.from(hp,x=>x>0&&x<4?1:0).reduce((a,b)=>a+b,0);
  walls=0;
 }
 return {...base,
  hp:Array.from(hp,x=>String(x)).join(""),
  colors:Array.from(color,x=>x.toString(16)).join(""),
  powerups:Array.from(power,x=>x.toString(16)).join(""),
  wallColors:[...base.wallColors.slice(0,4),"#5c7980"],
  vaporWalls:[...base.vaporWalls.slice(0,4),"#5c7980"],
  generatorVersion:4,pattern:["nested","rings","chambers","lattice","bands","mosaic","organic","spiral"][base.archetype],
  total:remaining,remaining
 };
}
