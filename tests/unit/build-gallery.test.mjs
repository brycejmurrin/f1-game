import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
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
    const embedded=JSON.parse(html.match(/id="manifest">(.*?)<\/script>/s)[1]);
    assert.equal(embedded.shots[0].thumb,null);
    assert.match(embedded.shots[0].web,/^data:image\/webp;base64,/);
    assert.deepEqual(Buffer.from(embedded.shots[0].web.split(',')[1],'base64'),fs.readFileSync(path.join(out,m.shots[0].web)));
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
test('embedded metadata cannot terminate its JSON script block',()=>{
 const page=buildHtml({shots:[{sector:'</script><script>window.fixture=1</script>'}],circuits:[]});
 assert.ok(!page.includes('</script><script>window.fixture'));
 assert.ok(page.includes('\\u003c/script>'));
});
test('CLI rejects a missing output value instead of silently using its default',()=>{
 const r=spawnSync(process.execPath,['tools/track/build-gallery.cjs','--out','--no-fetch'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(r.status,1);assert.match(r.stderr,/--out requires a value/);
});
