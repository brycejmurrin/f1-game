import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { buildTrackShotSurveyPlan } from '../../tools/lib/track-shot-survey.mjs';
import { screenshotCard, renderGallery } from '../../tools/lib/screenshot-gallery.cjs';
import { build, collectInputShots, parseShotMeta, buildHtml, ROOT } from '../../tools/track/build-gallery.cjs';

test('upstream storm and weather-first filename parsing survives integration', () => {
  for (const [name,tod,weather] of [['spa-12-orbit-day-storm.png','day','storm'],['spa-13-orbit-rain-night.png','night','rain']]) {
    const m=parseShotMeta(name); assert.equal(m.tod,tod); assert.equal(m.condition,weather); assert.equal(m.sector,'orbit');
  }
});
test('local capture metadata wins over filenames and same-stem images stay distinct', async () => {
  fs.mkdirSync(path.join(ROOT,'scratch'),{recursive:true});
  const dir=fs.mkdtempSync(path.join(ROOT,'scratch','gallery-fixture-'));
  try {
    const input=path.join(dir,'input');fs.mkdirSync(input);
    for (const [name,color] of [['first.png','red'],['second.png','blue']]) {
      const abs=path.join(input,name);await sharp({create:{width:16,height:12,channels:3,background:color}}).png().toFile(abs);
      fs.writeFileSync(abs+'.capture.json',JSON.stringify({job:{trackId:'spa',cam:'orbit',tod:'dusk',weather:'rain',frac:.25}}));
    }
    const raw=collectInputShots(input);assert.equal(raw.length,2);assert.equal(raw[0].condition,'rain');assert.equal(raw[0].tod,'dusk');
    const out=path.join(dir,'out');const m=await build({input,outRoot:out,standalone:true});
    const html=fs.readFileSync(path.join(out,'gallery.html'),'utf8');
    assert.doesNotMatch(html, /<script\b|<select\b|\sonclick=/i);
    const embedded = [...html.matchAll(/src="(data:image\/webp;base64,[^"]+)"/g)].map((match) => match[1]);
    assert.equal(embedded.length, 2, 'every capture is rendered before any script executes');
    assert.deepEqual(Buffer.from(embedded[0].split(',')[1], 'base64'), fs.readFileSync(path.join(out, m.shots[0].web)));
    await assert.rejects(build({input,outRoot:path.join(dir,'invalid'),standalone:true,skipImages:true}),/requires local images/);
    assert.equal(m.shots.length,2);assert.deepEqual(m.surveyBranches,[]);
    assert.notEqual(m.shots[0].web,m.shots[1].web);
    assert.notDeepEqual(fs.readFileSync(path.join(out,m.shots[0].web)),fs.readFileSync(path.join(out,m.shots[1].web)));
    assert.equal(m.shots[0].fraction,.25);assert.ok(fs.existsSync(path.join(out,'index.html')));
    fs.writeFileSync(path.join(out,'sentinel'),'keep');await assert.rejects(build({input,outRoot:out}),/already exists/);
    assert.equal(fs.readFileSync(path.join(out,'sentinel'),'utf8'),'keep');
    await assert.rejects(build({input,outRoot:input}),/already exists/);assert.ok(fs.existsSync(path.join(input,'first.png')));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('invalid path-like circuit metadata is refused', () => {
  const dir=fs.mkdtempSync(path.join(ROOT,'scratch','gallery-invalid-'));
  try {fs.writeFileSync(path.join(dir,'a.png'),'fixture');fs.writeFileSync(path.join(dir,'a.png.capture.json'),JSON.stringify({job:{trackId:'../outside'}}));assert.throws(()=>collectInputShots(dir),/Invalid circuit/);}
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('untrusted capture captions cannot introduce executable markup',()=>{
 const page=buildHtml({shots:[{sector:'</script><script>window.fixture=1</script>'}],circuits:[]});
 assert.ok(!page.includes('</script><script>window.fixture'));
 assert.match(page, /&lt;\/script&gt;/);
 assert.doesNotMatch(page, /<script\b/i);
});
test('CLI rejects a missing output value instead of silently using its default',()=>{
 const r=spawnSync(process.execPath,['tools/track/build-gallery.cjs','--out','--no-fetch'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(r.status,1);assert.match(r.stderr,/--out requires a value/);
});

test('shared screenshot pages expose native group links, expansion and empty states', () => {
  const page = renderGallery({ title: 'Gallery <check>', groups: [
    { title: 'Track <one>', cards: [screenshotCard({ title: 'View <A>', image: 'one.png', metadata: { job: '</details><script>bad()</script>' } })] },
    { title: 'Track two', cards: [] },
  ] });
  assert.doesNotMatch(page, /<script\b|<select\b|\son[a-z]+=/i);
  assert.match(page, /href="#gallery-1"/);
  assert.match(page, /id="section-1"/);
  assert.match(page, /class="image-view"/);
  assert.match(page, /No captures recorded/);
  assert.match(page, /View &lt;A&gt;/);
  assert.match(page, /&lt;script&gt;bad/);
});

test('screenshot images reject executable URLs and retain safe embedded media', () => {
  for (const image of ['javascript:bad()', 'data:text/html,<script>bad()</script>']) {
    assert.doesNotMatch(screenshotCard({ title: 'Bad', image }), /<img\b/);
  }
  assert.match(screenshotCard({ title: 'Good', image: 'data:image/png;base64,AAAA' }), /src="data:image\/png;base64,AAAA"/);
});

test('capture plans are prebuilt data downloads with faithful camera jobs', () => {
  const job = { name: 'view', track: 'spa', frac: .25, cam: 'orbit', az: 35 };
  const page = buildHtml({ shots: [{ circuit: 'spa', web: 'view.png', job }] });
  const match = page.match(/href="data:application\/json;charset=utf-8,([^"]+)"/);
  assert.ok(match);
  const plan = JSON.parse(decodeURIComponent(match[1].replace(/&#39;/g, "'")));
  assert.deepEqual(plan.shots, [job]);
  assert.doesNotMatch(page, /Export selected|Compare selected|<script/);
});

test('large circuit recipe downloads stay executable and preserve every duplicate-named job', () => {
  const shots = Array.from({ length: 65 }, (_, i) => ({ circuit: 'spa', web: 'view.png', job: { name: 'repeat', frac: i / 100, cam: 'orbit' } }));
  const html = buildHtml({ shots });
  const links = [...html.matchAll(/href="data:application\/json;charset=utf-8,([^"]+)"/g)].slice(0, 3);
  const plans = links.map((match) => JSON.parse(decodeURIComponent(match[1])));
  assert.deepEqual(plans.map(plan => plan.shots.length), [32, 32, 1]);
  for (const plan of plans) assert.equal(buildTrackShotSurveyPlan(plan).shots.length, plan.shots.length);
  assert.equal(new Set(plans.flatMap(plan => plan.shots.map(shot => shot.name))).size, 65);
});
