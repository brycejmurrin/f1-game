import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../../js/ui/experience.js', import.meta.url), 'utf8');
const ctx = vm.createContext({}); vm.runInContext(code + ';globalThis.api=UiExperience;', ctx);
test('pause context reads live classification and distinguishes online practice', () => {
  const p = {lap: 2}, G = { player:p, ranked:[{},p], track:{def:{name:'Monza'}}, session:'race', lapsTarget:12, practice:true, netPlay:{active:()=>true} };
  const b = ctx.api.raceBrief(G);
  assert.equal(b.title, 'Monza'); assert.match(b.detail,/P2/); assert.match(b.detail,/LAP 2 \/ 12/); assert.match(b.detail,/PRACTICE/); assert.match(b.detail,/RACE CONTINUES/);
  G.timeTrial = true; G.session = 'tt'; G.netPlay.active=()=>false;
  assert.doesNotMatch(ctx.api.raceBrief(G).detail,/P2|\/ 12|ONLINE/);
});
test('task doors retain canonical close and settings destinations', () => {
  const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  for(const id of ['mb-watch','mb-practice','mb-photo','pm-strategy','pm-review','pm-photo','pm-checkpoint-save']) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="photo-studio"[^>]*data-esc-close="ps-close"/);
  assert.match(code,/openSettingsPage\("driving", "pm-pit-panel"\)/);
  assert.match(code,/openSettingsPage\("driving", "pm-session-review"\)/);
});

test('Home varies real environments and shots per visit, preserving the shot through redraws', () => {
  let saved=0; const writes=[];
  const store={get:()=>saved,set:(_key,v)=>{saved=v;writes.push(v);}};
  const picker=ctx.api.homeVariation(store);
  assert.deepEqual(JSON.parse(JSON.stringify(picker.enter('auto','auto'))),{mode:'garage',shot:'hero'});
  picker.enter('auto','auto'); picker.peek('auto','auto');
  assert.equal(writes.length,1,'redraw, resize, and preview do not advance the visit');
  picker.leave(); assert.equal(picker.enter('auto','auto').mode,'track');
  picker.leave(); assert.equal(picker.enter('garage','side').shot,'side');
  picker.leave(); assert.equal(picker.enter('auto','auto').mode,'pitlane');
  const reload=ctx.api.homeVariation(store);
  assert.equal(reload.enter('auto','auto').mode,'studio','variation persists across reload');
  assert.deepEqual(writes,[1,2,3,4,5]);
});

test('Invalid visit metadata is bounded; a fixed Home camera survives changing environments', () => {
  const picker=ctx.api.homeVariation({get:()=>Infinity,set:()=>{}});
  assert.equal(picker.enter('track','front').shot,'front');
  picker.leave(); assert.equal(picker.enter('night','front').shot,'front');
});

test('an unready outdoor Photo request retains its caller instead of acquiring a garage camera', () => {
  let opened=0,waiting=0; const settings={hidden:false}, garage={hidden:true}, pause={hidden:false};
  const G={paused:false,$:id=>({pmsettings:settings,carsetup:garage,pausemenu:pause})[id]};
  const deps={source:'home',trackHome:true,trackReady:false,onWaiting:()=>waiting++,photoStudio:{open:()=>{opened++;return true;}}};
  assert.equal(ctx.api.openPhoto(G,deps),false);
  assert.equal(opened,0);assert.equal(waiting,1);assert.equal(settings.hidden,false);assert.equal(pause.hidden,false);assert.equal(G.paused,false);
});
