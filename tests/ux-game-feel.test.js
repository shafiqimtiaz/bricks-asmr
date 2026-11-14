import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { soloHtml, multiHtml } from "./helpers.js";

const leaderboard=readFileSync(new URL("../src/leaderboard.html",import.meta.url),"utf8");
const docs=readFileSync(new URL("../docs/MULTIPLAYER_REDESIGN.md",import.meta.url),"utf8");
const readme=readFileSync(new URL("../README.md",import.meta.url),"utf8");

test("UI and docs contain no board-style labels",()=>{
 for(const content of [soloHtml,multiHtml,leaderboard,readme,docs]){
  assert.doesNotMatch(content,/BOARD STYLE|VISUAL MODE|VISUAL STYLE|SELECT THEME|CHOOSE THEME| · CRT|Clean\s*\/\s*CRT|CRT-Vintage|Vapor themes/i);
 }
 assert.doesNotMatch(soloHtml,/SNAME\[style\]/);
});

test("global scores preserve historical IDs but hide their style suffix",()=>{
 const source=leaderboard.match(/function boardLabel\(key\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source,"board label function exists");
 const format=new Function(source+"\nreturn boardLabel;")();
 assert.equal(format("abc123-vintage"),"SEED ABC123");
 assert.equal(format("abc123-clean-a1280"),"SEED ABC123");
 assert.equal(format("abc123-vapor-a360"),"SEED ABC123");
 assert.equal(format("d20261114-vintage"),"DAILY 1114");
 assert.doesNotMatch(format("abc123-vintage"),/vintage|CRT/i);
});

test("keyboard menus acquire and restore focus without moving the game",()=>{
 assert.match(soloHtml,/querySelector\('a,button'\)\?\.focus\(\)/);
 assert.match(multiHtml,/querySelector\("a,button"\)\?\.focus\(\)/);
 for(const html of [soloHtml,multiHtml]){
  assert.match(html,/closeMenu\(true\)/);
  assert.match(html,/restoreFocus===true/);
  assert.match(html,/if\(expanded\)|if\(opened\)/);
 }
 assert.match(multiHtml,/!\$\("hudMenu"\)\.hidden\)return;/);
 assert.match(multiHtml,/\$\("hudMenu"\)\.hidden\)\{event\.preventDefault\(\);launch\(\);\}/);
 assert.match(soloHtml,/P\('nameModal'\)\.addEventListener\('keydown'/);
});

test("game-feel feedback stays visual-only and reduces motion on request",()=>{
 assert.doesNotMatch(soloHtml,/Math\.random\(\)\s*-\s*\.5\)\s*\*\s*shake/);
 assert.match(soloHtml,/Math\.sin\(t \* 29\)/);
 assert.match(soloHtml,/prefers-reduced-motion: reduce/);
 assert.match(multiHtml,/prefers-reduced-motion: reduce/);
 assert.match(soloHtml,/#crt,#crt::after\{animation:none\}/);
});

test("liminal rankings and menus keep essential actions with no arcade decorations",()=>{
 for(const id of ["bestTime","bestScore","fastest","players","mine","refresh","more","rows"]){
  assert.match(leaderboard,new RegExp('id="'+id+'"'));
 }
 assert.doesNotMatch(leaderboard,/class="(?:cabinet|podium|pixel-stripe|art|subcopy|metric-hint)"/);
 assert.match(leaderboard,/touchstart/);
 assert.match(leaderboard,/touchend/);
 assert.match(leaderboard,/aria-pressed="true">TIME/);
 assert.match(leaderboard,/role="status" aria-live="polite"/);
 for(const html of [soloHtml,multiHtml]){
  assert.match(html,/id="hudMenu" hidden/);
  assert.match(html,/aria-label="Open menu"/);
  assert.match(html,/aria-pressed="true">SOUND ON/);
  assert.match(html,/setAttribute\(['"]aria-label['"],(?:opened|expanded)\?['"]Close menu['"]:['"]Open menu['"]\)/);
  assert.match(html,/#hud(?: #hudMenu)?\[hidden\]\{display:none!important\}|#hudMenu\[hidden\]\{display:none!important\}/);
 }
 assert.match(soloHtml,/e.target.id!=='soundToggle'&&e.target.id!=='soloMode'/);
 assert.match(soloHtml,/P\('soloMode'\)\.textContent = soloMode === 'infinite' \? 'INFINITE' : 'CLASSIC'/);
});
