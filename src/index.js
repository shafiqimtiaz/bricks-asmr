import multiplayer from "./multi.js";
import { soloCoreSource } from "./game-core.js";
import { engineSource } from "./engine.js";
export { BrickRoom } from "./multi.js";
import GAME from "./solo.html";
import LEADERBOARD from "./leaderboard.html";
import { icons, manifest, serviceWorker, withPwa } from "./pwa.js";

function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
const KEY=/^[a-z0-9]{1,16}-v4-(clean|vintage|vapor)(?:-a\d{3,4})?$/,ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,NAME=/^[\p{L}\p{N} _.-]{2,24}$/u;
async function api(req,env,url){
 if(req.method==='GET'){
  if(url.searchParams.get('scope')==='world'){
   try{
    const metric=url.searchParams.get('metric')==='score'?'score':'time';
    const offsetRaw=Number(url.searchParams.get('offset')||0);
    if(!Number.isSafeInteger(offsetRaw)||offsetRaw<0||offsetRaw>1000000)return json({error:'Invalid offset'},400);
    const db=env.DB.withSession('first-unconstrained');
    const sql=metric==='score'
     ?'SELECT board_key AS boardKey, player_id AS playerId, player_name AS name, best_score AS score, bricks_broken AS bricksBroken, best_combo AS bestCombo FROM leaderboard_scores WHERE board_key GLOB '*-v4-*' ORDER BY best_score DESC, best_combo DESC, bricks_broken DESC, updated_at ASC, player_id ASC LIMIT 51 OFFSET ?'
     :'SELECT board_key AS boardKey, player_id AS playerId, player_name AS name, best_ms AS timeMs FROM leaderboard_times WHERE board_key GLOB '*-v4-*' ORDER BY best_ms ASC, updated_at ASC, player_id ASC, board_key ASC LIMIT 51 OFFSET ?';
    const list=await db.prepare(sql).bind(offsetRaw).all();
    const count=await db.prepare(metric==='score'?'SELECT COUNT(DISTINCT player_id) AS n FROM leaderboard_scores WHERE board_key GLOB '*-v4-*'':'SELECT COUNT(DISTINCT player_id) AS n FROM leaderboard_times WHERE board_key GLOB '*-v4-*'').first();
    const entries=list.results||[];
    return json({entries:entries.slice(0,50),totalPlayers:count?.n||0,hasMore:entries.length>50,nextOffset:offsetRaw+50});
   }catch(e){console.error('world leaderboard GET',e);return json({error:'Leaderboard unavailable'},503);}
  }
  const key=url.searchParams.get('key')||'';if(!KEY.test(key))return json({error:'Invalid challenge'},400);
  try{const db=env.DB.withSession('first-unconstrained');
   const list=await db.prepare('SELECT player_id AS playerId, player_name AS name, best_ms AS timeMs FROM leaderboard_times WHERE board_key=? ORDER BY best_ms ASC, updated_at ASC, player_id ASC LIMIT 50').bind(key).all();
   const count=await db.prepare('SELECT COUNT(*) AS n FROM leaderboard_times WHERE board_key=?').bind(key).first();
   return json({entries:list.results||[],totalPlayers:count?.n||0});
  }catch(e){console.error('leaderboard GET',e);return json({error:'Leaderboard unavailable'},503);}
 }
 if(req.method==='POST'){
  if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)return json({error:'Origin rejected'},403);
  if(!(req.headers.get('content-type')||'').startsWith('application/json'))return json({error:'Expected JSON'},415);
  let input;try{const raw=await req.text();if(raw.length>2048)return json({error:'Payload too large'},413);input=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
  const name=typeof input?.name==='string'?input.name.trim().normalize('NFKC'):'';
  const scoreRun=input?.metric==='score';
  if(!KEY.test(input?.key||'')||!ID.test(input?.playerId||'')||!NAME.test(name))return json({error:'Invalid result'},400);
  if(scoreRun){
   if(!Number.isSafeInteger(input.score)||input.score<1||input.score>1000000000||
    !Number.isSafeInteger(input.bricksBroken)||input.bricksBroken<0||input.bricksBroken>100000000||
    !Number.isSafeInteger(input.bestCombo)||input.bestCombo<0||input.bestCombo>1000000)return json({error:'Invalid score'},400);
  }else if(!Number.isSafeInteger(input?.timeMs)||input.timeMs<1||input.timeMs>86400000)return json({error:'Invalid result'},400);
  try{
   if(scoreRun){
    await env.DB.prepare('INSERT INTO leaderboard_scores(board_key,player_id,player_name,best_score,bricks_broken,best_combo) VALUES(?,?,?,?,?,?) ON CONFLICT(board_key,player_id) DO UPDATE SET best_score=excluded.best_score,bricks_broken=excluded.bricks_broken,best_combo=excluded.best_combo,updated_at=unixepoch() WHERE excluded.best_score>leaderboard_scores.best_score').bind(input.key,input.playerId,name,input.score,input.bricksBroken,input.bestCombo).run();
    await env.DB.prepare('UPDATE leaderboard_scores SET player_name=? WHERE player_id=? AND player_name<>?').bind(name,input.playerId,name).run();
   }else{
    await env.DB.prepare('INSERT INTO leaderboard_times(board_key,player_id,player_name,best_ms) VALUES(?,?,?,?) ON CONFLICT(board_key,player_id) DO UPDATE SET player_name=excluded.player_name,best_ms=MIN(leaderboard_times.best_ms,excluded.best_ms),updated_at=CASE WHEN excluded.best_ms < leaderboard_times.best_ms THEN unixepoch() ELSE leaderboard_times.updated_at END').bind(input.key,input.playerId,name,input.timeMs).run();
    await env.DB.prepare('UPDATE leaderboard_times SET player_name=? WHERE player_id=? AND player_name<>?').bind(name,input.playerId,name).run();
   }
   return json({saved:true},201);
  }catch(e){console.error('leaderboard POST',e);return json({error:'Save failed'},503);}
 }
 return json({error:'Method not allowed'},405);
}
export default {async fetch(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/multiplayer'||path==='/multiplayer/'||/^\/multiplayer\/[A-Z2-9]{6}\/?$/i.test(path)){const u=new URL(req.url);u.pathname='/';return multiplayer.fetch(new Request(u,req),env);}
 if(path.startsWith('/api/multiplayer/rooms')){const u=new URL(req.url);u.pathname=path.replace('/api/multiplayer','/api');return multiplayer.fetch(new Request(u,req),env);}
 if(path==='/api/leaderboard')return api(req,env,url);
 if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});
 if(path==='/manifest.webmanifest')return new Response(req.method==='HEAD'?null:manifest,{headers:{'content-type':'application/manifest+json; charset=utf-8','cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
 if(path==='/sw.js')return new Response(req.method==='HEAD'?null:serviceWorker,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache','service-worker-allowed':'/','x-content-type-options':'nosniff'}});
 if(Object.hasOwn(icons,path))return new Response(req.method==='HEAD'?null:Uint8Array.from(atob(icons[path]),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'}});
 if(path==='/'||path==='/index.html')return new Response(req.method==='HEAD'?null:withPwa(GAME.replace('<script>','<script>\n'+soloCoreSource+'\n'+engineSource+'\n')),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}});
 if(path==='/leaderboard'||path==='/leaderboard/')return new Response(req.method==='HEAD'?null:withPwa(LEADERBOARD),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}});
 return new Response('Not found',{status:404});
}};