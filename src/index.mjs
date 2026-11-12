import multiplayer from "./multi.mjs";
import { soloCoreSource } from "./game-core.mjs";
import { engineSource } from "./engine.mjs";
export { BrickRoom } from "./multi.mjs";
import GAME from "./solo.html";
import LEADERBOARD from "./leaderboard.html";

function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
const KEY=/^[a-z0-9]{1,16}-[1-9]\d{0,2}-(clean|vintage|vapor)(?:-a\d{3,4})?$/,ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,NAME=/^[\p{L}\p{N} _.-]{2,24}$/u;
async function api(req,env,url){
 if(req.method==='GET'){
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
  if(!KEY.test(input?.key||'')||!ID.test(input?.playerId||'')||!NAME.test(name)||!Number.isSafeInteger(input?.timeMs)||input.timeMs<1||input.timeMs>86400000)return json({error:'Invalid result'},400);
  try{
   await env.DB.prepare('INSERT INTO leaderboard_times(board_key,player_id,player_name,best_ms) VALUES(?,?,?,?) ON CONFLICT(board_key,player_id) DO UPDATE SET player_name=excluded.player_name,best_ms=MIN(leaderboard_times.best_ms,excluded.best_ms),updated_at=CASE WHEN excluded.best_ms < leaderboard_times.best_ms THEN unixepoch() ELSE leaderboard_times.updated_at END').bind(input.key,input.playerId,name,input.timeMs).run();
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
 if(path==='/'||path==='/index.html')return new Response(req.method==='HEAD'?null:GAME.replace('<script>','<script>\n'+soloCoreSource+'\n'+engineSource+'\n'),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}});
 if(path==='/leaderboard'||path==='/leaderboard/')return new Response(req.method==='HEAD'?null:LEADERBOARD,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}});
 return new Response('Not found',{status:404});
}};