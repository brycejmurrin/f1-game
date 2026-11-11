import "../helpers/git-fixture-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { digest, matrixOutputDir, captureSource, matrixManifest, resumeManifest, evidenceFile, metadataFile, validateRunDirectory, verifiedCell, galleryIndex, garageChannel } from "../../tools/shot/lib/design-matrix-run.mjs";
import { prepareGallery, galleryHtml } from "../../tools/shot/capture-gallery.mjs";
import { captureRequest } from "../../tools/shot/run-capture-request.mjs";
import { parse as parseYAML } from "yaml";
import {
  expandMatrix, batchSlice, frameForPart, cameraFor, labelDiff, pendingGroups, parseVariant, parseBatch,
  checkLimits, parseArgs, sheetHtml, PART_BOXES, SAME_PCT,
} from "../../tools/shot/lib/design-matrix.mjs";

const spec = { parts: ["sidepod", "frontWing"], angles: ["headOn", "grazing"], colours: ["dark", "light"], lights: ["lamp", "off"],
  variants: ["podFinish=matte"], baseline: "podFinish=gloss" };

test("expansion: product of axes, baseline first in every group", () => {
  const g = expandMatrix(spec);
  assert.equal(g.length, 2 * 2 * 2 * 2);
  for (const x of g) {
    assert.equal(x.cells[0].isBaseline, true);
    assert.equal(x.cells.length, 2);
    assert.equal(x.cells[1].baselineKey, x.cells[0].key);
  }
  assert.equal(new Set(g.flatMap((x) => x.cells.map((c) => c.key))).size, g.length * 2);
});

test("design: base livery, , variant, light knob", () => {
  const c = expandMatrix({ ...spec, lights: ["keyHi"], parts: ["sidepod"], angles: ["headOn"], colours: ["mid"] })[0].cells[1];
  assert.deepEqual(c.design, { podFinish: "matte", "light.keyMul": 1.5 });
  assert.equal(c.base, "splitshot");
});

test("unknown ids throw with the list", () => {
  assert.throws(() => expandMatrix({ ...spec, parts: ["nope"] }), /no part/);
  assert.throws(() => expandMatrix({ ...spec, angles: ["x"] }), /no angle/);
  assert.throws(() => expandMatrix({ ...spec, lights: ["x"] }), /no light/);
    assert.throws(() => parseVariant("bad"), /field=value/);
});

test("framing: farther for bigger parts, closer for higher fill, scales with fov", () => {
  const w = PART_BOXES.frontWing, m = PART_BOXES.mirror;
  assert.ok(frameForPart(w, { az: 0 }) > frameForPart(m, { az: 0 }));
  assert.ok(frameForPart(w, { az: 0, fill: 0.9 }) < frameForPart(w, { az: 0, fill: 0.5 }));
  assert.ok(frameForPart(w, { az: 0, fov: 30 }) > frameForPart(w, { az: 0, fov: 60 }));
  const d = frameForPart({ size: [1, 1, 1] }, { az: 0, fov: 90, aspect: 1, fill: 1 });
  assert.ok(Math.abs(d - 0.5) < 0.02);
});

test("camera: angles differ; haloBehind uses the catalog station", () => {
  const a = cameraFor("sidepod", "headOn"), b = cameraFor("sidepod", "grazing"), h = cameraFor("halo", "haloBehind");
  assert.notEqual(a.az, b.az);
  assert.equal(h.view, "rear");
  assert.deepEqual(a.target, PART_BOXES.sidepod.c);
});

test("diff labelling at the 0.5 % line", () => {
  assert.equal(SAME_PCT, 0.5);
  assert.equal(labelDiff(0.004).same, true);
  assert.equal(labelDiff(0.005).same, false);
  assert.equal(labelDiff(0.123).text, "12.3%");
  assert.equal(labelDiff(null, true).text, "baseline");
  assert.equal(labelDiff(null).same, false);
});

test("batches partition whole groups", () => {
  const g = expandMatrix(spec);
  const parts = [1, 2, 3].map((k) => batchSlice(g, k, 3));
  assert.equal(parts.flat().length, g.length);
  assert.equal(new Set(parts.flat().map((x) => x.id)).size, g.length);
  assert.throws(() => batchSlice(g, 4, 3));
  assert.deepEqual(parseBatch("2/5"), [2, 5]);
  assert.throws(() => parseBatch("x"));
});

test("manifest resume skips finished groups, redoes missing files", () => {
  const g = expandMatrix(spec).slice(0, 2);
  const cells = {};
  for (const c of g[0].cells) cells[c.key] = { status: "done", png: c.key + ".png" };
  assert.equal(pendingGroups(g, { cells }).length, 1);
  assert.equal(pendingGroups(g, { cells }, () => false).length, 2);
  cells[g[1].cells[0].key] = { status: "failed" };
  assert.equal(pendingGroups(g, { cells }).length, 1);
});

test("limits: dpr, viewport, loadavg", () => {
  checkLimits({ viewport: [844, 390], load: 1 });
  assert.throws(() => checkLimits({ viewport: [844, 390], dpr: 2 }), /dpr/);
  assert.throws(() => checkLimits({ viewport: [1920, 1080] }), /1600x900/);
  assert.throws(() => checkLimits({ viewport: [844, 390], load: 3 }), /loadavg/);
  assert.doesNotThrow(() => checkLimits({ viewport: [844, 390], load: 65.7, platform: "darwin" }));
  assert.throws(() => checkLimits({ viewport: [844, 390], load: 3, platform: "linux" }), /loadavg/);
});

test("args and sheet", () => {
  const a = parseArgs(["--part=halo,fin", "--phone", "--batch=1/2"]);
  assert.deepEqual(a.parts, ["halo", "fin"]);
  assert.deepEqual(a.viewport, [844, 390]);
  const g = expandMatrix({ ...spec, parts: ["sidepod"], lights: ["lamp"] });
  const cells = {};
  for (const x of g) for (const c of x.cells) cells[c.key] = { status: "done", png: c.key + ".png", diff: c.isBaseline ? null : 0.001 };
  const html = sheetHtml(g, { cells }, { phone: true });
  assert.match(html, /looks the same/);
  assert.match(html, /844\/390/);
  assert.match(html, /light: lamp/);
});

test("mixed recipes validate fields, CLI values, bounds and filename collisions", () => {
  assert.deepEqual(parseVariant("pod=#225bb4;podFinish=satin;part.aero=style_aero_spoon"), {pod:"#225bb4",podFinish:"satin","part.aero":"style_aero_spoon"});
  for (const s of ["pod=", "pod=x;pod=y", "__proto__=x", "pod=x;"]) assert.throws(()=>parseVariant(s));
  for (const args of [["--unknown"],["--run=../escape"],["--part"],["--resume=false"],["--fill=NaN"],["--fov=0"],["--viewport=0x50"],["--viewport=90.1x80"],["--backend=cpu"],["--batch=0/2"]]) assert.throws(()=>parseArgs(args));
  assert.throws(()=>expandMatrix({...spec,colours:["ice-blue","ice_blue"]}),/collide/);
  assert.equal(expandMatrix({...spec,variants:["factory","factory"]})[0].cells.length,2);
});

test("resume rejects changed sources, plans and tampered provenance", () => {
  const m=matrixManifest("test",{revision:"a",worktreeHash:"b"},{backend:"three"});
  assert.equal(resumeManifest(m,m),m);
  assert.throws(()=>resumeManifest(m,matrixManifest("test",{revision:"c"},{backend:"three"})),/differs/);
  assert.throws(()=>resumeManifest({...m,source:{revision:"tampered"}},m),/differs/);
  assert.throws(()=>resumeManifest({cells:{}},m),/differs/);
  assert.throws(()=>resumeManifest({...m,kind:"geometry-preview"},m),/differs/);
});

function temp(t) {
  fs.mkdirSync("artifacts",{recursive:true});const dir=fs.mkdtempSync(path.resolve("artifacts/matrix-test-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;
}
test("run files reject traversal, symlink escapes and dangling symlinks", t => {
  const root=temp(t),dir=path.join(root,"artifacts/run");fs.mkdirSync(dir,{recursive:true});
  assert.throws(()=>matrixOutputDir(root,"x","../outside"),/inside/);
  assert.throws(()=>evidenceFile(dir,"../x.png"),/unsafe/);
  const outside=path.join(root,"absent");fs.symlinkSync(outside,path.join(dir,"sheet.html"));
  assert.throws(()=>metadataFile(dir,"sheet.html"),/regular/);assert.equal(fs.existsSync(outside),false);
  fs.symlinkSync(outside,path.join(dir,"dangling.png"));assert.throws(()=>evidenceFile(dir,"dangling.png"),/regular/);
  assert.throws(()=>validateRunDirectory(dir),/symlinks/);
});

test("verified cells require matching bytes and native receipt; coverage excludes stale records", t => {
  const dir=temp(t),g=expandMatrix(spec).slice(0,1),png="frame.png",bytes=Buffer.from("test-only bytes");fs.writeFileSync(path.join(dir,png),bytes);
  const m=matrixManifest("fixture",{revision:"fixture"},{backend:"three"}),c=g[0].cells[0];
  m.cells[c.key]={status:"done",png,sha256:digest(bytes),receipt:{backend:"three",readiness:{mode:"test-only"},via:"fixture"}};
  assert.ok(verifiedCell(dir,m.cells[c.key],"three"));assert.equal(verifiedCell(dir,m.cells[c.key],"webgl2"),false);
  assert.equal(galleryIndex(g,m).completed,1);assert.equal(galleryIndex(g,m).missing.length,1);
  fs.writeFileSync(path.join(dir,png),"corrupt");assert.equal(verifiedCell(dir,m.cells[c.key],"three"),false);
});

function fakeChild() {const c=new EventEmitter();c.stdout=new PassThrough();c.stdin=new PassThrough();c.exitCode=null;c.signalCode=null;return c;}
test("garage exit before ready rejects immediately", async () => {
  const child=fakeChild(),c=garageChannel(child,{startupMs:1000});child.emit("close",1,null);await assert.rejects(c.ready,/exited/);
});
test("garage commands match IDs, reject overlap and poison the channel after timeout", async () => {
  const child=fakeChild(),c=garageChannel(child,{commandMs:30});child.stdout.write('null\n{"ready":true}\n');await c.ready;
  const p=c.send({shot:"a"});await assert.rejects(c.send({shot:"b"}),/pending/);
  child.stdout.write('{"id":99,"ok":true}\n{"id":1,"ok":true}\n');assert.equal((await p).id,1);
  await assert.rejects(c.send({shot:"timeout"}),/timed out/);child.stdout.write('{"id":2,"ok":true}\n');await assert.rejects(c.send({shot:"late"}),/timed out/);child.emit("close",0,null);
});

test("gallery export verifies real image bytes, preserves source/status, escapes HTML and separates geometry", async t => {
  const dir=temp(t),image=await sharp({create:{width:8,height:8,channels:3,background:"blue"}}).png().toBuffer();
  fs.writeFileSync(path.join(dir,"frame.png"),image);
  const native={id:"native",title:'<script>bad</script>',src:"frame.png",sha256:digest(image),sourceRevision:"old",status:"archive",backend:"three",readiness:{mode:"fixture"},via:"test-only",design:{podFinish:"satin"}};
  const data={items:[native,{...native,id:"geometry",geometryOnly:true,backend:"CPU projection"}]},input=path.join(dir,"input.json");fs.writeFileSync(input,JSON.stringify(data));
  const pack=await prepareGallery(input,dir);assert.equal(pack.files.size,1);assert.equal(pack.data.export.counts["native-screenshot"],1);assert.equal(pack.data.export.counts["geometry-preview"],1);assert.equal(pack.data.items[0].sourceRevision,"old");assert.equal(pack.data.items[0].status,"archive");assert.equal(pack.data.items[0].width,8);
  const html=galleryHtml(pack.data),scriptTags=h=>h.split(/<script\b/i).length-1;
  assert.equal(scriptTags(html),scriptTags(galleryHtml({...pack.data,items:[]})),"an item title must add no <script> element");
  assert.equal(html.includes("&lt;script&gt;bad"),true);
  fs.writeFileSync(path.join(dir,"frame.png"),"corrupt");await assert.rejects(prepareGallery(input,dir),/hash/);
  fs.writeFileSync(path.join(dir,"frame.png"),image);data.items[0].src="../escape.png";fs.writeFileSync(input,JSON.stringify(data));await assert.rejects(prepareGallery(input,dir),/escapes/);
});

test("real CLI plan is read-only and missing browser fails before output creation", t => {
  const dir=temp(t),out=path.join(dir,"output"),args=["tools/shot/design-matrix.mjs","--part=sidepod","--angles=headOn","--colours=dark","--run=fixture",`--out=${out}`];
  const env={...process.env,PW_CHROMIUM:path.join(dir,"missing-chromium")};
  const plan=spawnSync(process.execPath,[...args,"--plan"],{env,encoding:"utf8",timeout:10000});assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).browser.available,false);assert.equal(fs.existsSync(out),false);
  const capture=spawnSync(process.execPath,args,{env,encoding:"utf8",timeout:10000});assert.equal(capture.status,1);assert.equal(capture.stderr.split(". ")[0],"design-matrix: native screenshots unavailable: no executable Chromium discovered");assert.equal(fs.existsSync(out),false);
});

test("source fingerprints detect tracked and untracked changes", t => {
  const root=temp(t),git=(...args)=>{const r=spawnSync("git",args,{cwd:root,encoding:"utf8"});assert.equal(r.status,0,r.stderr);return r.stdout;};
  git("init");git("config","user.email","fixture@example.invalid");git("config","user.name","Fixture");
  fs.mkdirSync(path.join(root,"js"));fs.writeFileSync(path.join(root,"js/game.js"),"fixture");git("add",".");git("commit","-m","fixture");
  const clean=captureSource(root);assert.equal(clean.dirty,false);
  fs.writeFileSync(path.join(root,"js/game.js"),"changed");const changed=captureSource(root);assert.notEqual(clean.worktreeHash,changed.worktreeHash);
  fs.mkdirSync(path.join(root,"tools"));fs.writeFileSync(path.join(root,"tools","new.mjs"),"untracked");assert.notEqual(changed.worktreeHash,captureSource(root).worktreeHash);
  fs.symlinkSync(path.join(root,"js/game.js"),path.join(root,"tools","linked.mjs"));assert.throws(()=>captureSource(root),/regular file/);
});

test("real CLI gallery export packages image assets and rejects output reuse", async t => {
  const dir=temp(t),image=await sharp({create:{width:8,height:8,channels:3,background:"red"}}).png().toBuffer(),input=path.join(dir,"input.json"),out=path.join(dir,"export");
  fs.writeFileSync(path.join(dir,"frame.png"),image);fs.writeFileSync(input,JSON.stringify({items:[{id:"fixture",title:"Fixture",src:"frame.png",sha256:digest(image),geometryOnly:true}]}));
  const args=["tools/shot/capture-gallery.mjs",`--input=${input}`,`--assets=${dir}`,`--out=${out}`];
  const run=()=>spawnSync(process.execPath,args,{encoding:"utf8",timeout:10000});
  const r=run();assert.equal(r.status,0,r.stderr);const data=JSON.parse(fs.readFileSync(path.join(out,"gallery.json")));assert.equal(data.items[0].kind,"geometry-preview");assert.equal(digest(fs.readFileSync(path.join(out,data.items[0].src))),digest(image));assert.ok(fs.existsSync(path.join(out,"index.html")));
  assert.equal(run().stderr.trim(),"capture-gallery: export output must be new or empty");
});

test("CI requests bound work, reject output/command injection and retain mixed recipes as one argument", () => {
  const request={schemaVersion:1,args:["--part=sidepod,frontWing","--angles=headOn","--colours=light","--variants=pod=#225bb4;podFinish=satin"]};
  const r=captureRequest(request);assert.equal(r.cells,4);assert.ok(r.args.includes(request.args[3]));assert.equal(r.args.at(-1),"--out=artifacts/design-matrix/ci-capture");
  for(const args of [["--out=../escape"],["--resume"],["--team=x","--team=y"],["--part=sidepod","--angles=headOn,grazing,specular,low34,topFront","--colours=dark,mid,light","--lights=lamp,off"]])assert.throws(()=>captureRequest({schemaVersion:1,args}));
  assert.throws(()=>captureRequest({...request,command:"sh"}));
});

test("capture workflow is dispatch-only, read-only and pins the captured source without cancelling active jobs", () => {
  const w=parseYAML(fs.readFileSync(".github/workflows/capture-gallery.yml","utf8"));
  assert.deepEqual(w.permissions,{contents:"read"});assert.equal(w.concurrency["cancel-in-progress"],false);assert.equal(w.jobs.capture["runs-on"],"macos-latest");assert.equal(w.jobs.capture["timeout-minutes"],15);
  assert.deepEqual(Object.keys(w.on),["workflow_dispatch"],"dispatch only: no push-request relay");assert.equal(w.jobs.capture.steps[0].with.ref,"${{ github.sha }}");assert.equal(w.jobs.capture.steps[0].with["persist-credentials"],false);
  assert.ok(w.jobs.capture.steps.some(s=>s.run==="node tools/shot/run-capture-request.mjs"));assert.ok(w.jobs.capture.steps.some(s=>s.with?.["retention-days"]===7));
});
