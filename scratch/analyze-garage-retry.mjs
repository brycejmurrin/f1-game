// Offline analyzer only. Usage: node scratch/analyze-garage-retry.mjs INPUT_DIR [--software]
// Reads game-garage-retry-ab.json and adjacent CPU profiles; writes analysis.json/report.md there.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const argv=process.argv.slice(2);
if(argv.includes('--help')){console.log('usage: node scratch/analyze-garage-retry.mjs INPUT_DIR_OR_JSON [--software]\n--software explicitly validates the small software pilot; never emits native hardware claims.');process.exit(0);}
const unknown=argv.filter(x=>x.startsWith('--')&&x!=='--software');
if(unknown.length)throw Error('unknown flags: '+unknown.join(','));
const input=path.resolve(argv.find(x=>!x.startsWith('--'))||'.');
const file=fs.statSync(input).isDirectory()?path.join(input,'game-garage-retry-ab.json'):input;
const dir=path.dirname(file),r=JSON.parse(fs.readFileSync(file,'utf8')),software=argv.includes('--software');
const errors=[],warnings=[],checks=[];
const check=(ok,message)=>{checks.push({outcome:ok?'Pass':'Fail',message});if(!ok)errors.push(message);return !!ok;};
const num=x=>typeof x==='number'&&Number.isFinite(x);
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const quantile=(a,q)=>{const s=a.filter(num).sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(s.length*q))]:null;};
const stats=a=>{a=a.filter(num);return {n:a.length,mean:avg(a),p50:quantile(a,.5),p95:quantile(a,.95),min:a.length?Math.min(...a):null,max:a.length?Math.max(...a):null};};
const json=x=>JSON.stringify(x);
const stableScale=s=>s&&Object.fromEntries(['scale','tier','autoTier','autoShed','userTier','tierFloor','tierHold','crashStrikes'].filter(k=>k in s).map(k=>[k,s[k]]));
const expectedRgb=color=>/^#[0-9a-f]{6}$/i.test(color||'')?[1,3,5].map(i=>(parseInt(color.slice(i,i+2),16)/255).toFixed(3)).join(','):null;
const keyRgb=key=>typeof key==='string'?key.split('|')[2]?.split('/').at(-1):null;
const expectedColor=i=>'#'+(0x204060+i*0x030507).toString(16).slice(-6);
const allocationKeys=['devicesObserved','bufferCreated','bufferDestroyed','bufferCreatedBytes','bufferDestroyedBytes','bufferUndestroyedBytes','bufferPeakUndestroyedBytes','textureCreated','textureDestroyed','deviceDestroyed','pipelineCreated','pipelineAsyncCreated','shaderModulesCreated','queueSubmits'];
function delta(before,after){
 if(!before||!after)return null;
 const d={};for(const k of allocationKeys){if(num(before[k])&&num(after[k]))d[k]=after[k]-before[k];}
 d.byUsage={};for(const usage of new Set([...Object.keys(before.byUsage||{}),...Object.keys(after.byUsage||{})])){
  const a=before.byUsage?.[usage]||{},b=after.byUsage?.[usage]||{};
  d.byUsage[usage]=Object.fromEntries(['created','destroyed','createdBytes','destroyedBytes','undestroyedBytes'].map(k=>[k,(b[k]||0)-(a[k]||0)]));
 }
 return d;
}
function idle(window){
 if(!window?.render)return null;
 const rows=window.render.rows||[],n=window.render.mainRenders;
 return {mainRenders:n,mainBuildPresentMs:stats(window.beginPresentMs||[]),cadenceMs:stats(window.cadenceMs||[]),
  drawCallsPerMainRender:n?rows.reduce((s,x)=>s+x.calls,0)/n:null,
  trianglesPerMainRender:n?rows.reduce((s,x)=>s+x.triangles,0)/n:null,
  mainSceneCallsPerRender:n?rows.filter(x=>x.main).reduce((s,x)=>s+x.calls,0)/n:null,
  mainSceneTrianglesPerRender:n?rows.filter(x=>x.main).reduce((s,x)=>s+x.triangles,0)/n:null};
}
function profile(name,required){
 const p=path.join(dir,name);
 if(!fs.existsSync(p)){if(required)check(false,'missing CPU profile '+name);return null;}
 const raw=fs.readFileSync(p),rawSha256=createHash('sha256').update(raw).digest('hex');
 let x;try{x=JSON.parse(raw.toString('utf8'));}catch(e){check(false,'invalid CPU profile '+name+': '+e.message);return null;}
 const boundsValid=check(Number.isSafeInteger(x.startTime)&&Number.isSafeInteger(x.endTime)&&x.endTime>=x.startTime,'CPU profile has valid integer bounds: '+name);
 const arraysValid=check(Array.isArray(x.samples)&&Array.isArray(x.timeDeltas)&&x.samples.length>0&&x.samples.length===x.timeDeltas.length,'CPU profile sample/delta lengths match: '+name);
 if(!boundsValid||!arraysValid)return {file:name,rawSha256,valid:false,topSampledWall:[]};
 const nodes=new Map((x.nodes||[]).map(n=>[n.id,n.callFrame||{}]));
 const idsValid=check(x.samples.every(id=>Number.isSafeInteger(id)&&nodes.has(id)),'CPU profile samples resolve to nodes: '+name);
 const deltasValid=check(x.timeDeltas.every(Number.isSafeInteger),'CPU profile has integer time deltas: '+name);
 if(!idsValid||!deltasValid)return {file:name,rawSha256,valid:false,samples:x.samples.length,topSampledWall:[]};
 let absolute=x.startTime;
 const negativeDeltas=[],points=x.timeDeltas.map((deltaUs,index)=>{
  const beforeTimestampUs=absolute;absolute+=deltaUs;
  if(deltaUs<0)negativeDeltas.push({index,deltaUs,beforeTimestampUs,afterTimestampUs:absolute,sampleId:x.samples[index]});
  return {timestampUs:absolute,sampleId:x.samples[index],originalIndex:index};
 });
 const timestampsValid=check(points.every(p=>Number.isSafeInteger(p.timestampUs)&&p.timestampUs>=x.startTime&&p.timestampUs<=x.endTime),'CPU profile reconstructed timestamps stay within bounds: '+name);
 // DevTools reconstructs timestamps, then sorts timestamps WITH their sample IDs.
 // Preserve raw bytes and every sample; no clamp, absolute value, dropping or tolerance.
 const ordered=points.slice().sort((a,b)=>a.timestampUs-b.timestampUs||a.originalIndex-b.originalIndex);
 const sortedValid=check(ordered.length===x.samples.length&&ordered.every((p,i)=>!i||p.timestampUs>=ordered[i-1].timestampUs),'CPU profile chronological sample count/order preserved: '+name);
 if(!timestampsValid||!sortedValid)return {file:name,rawSha256,valid:false,samples:x.samples.length,negativeDeltas,topSampledWall:[]};
 const attributed=new Map();let previous=x.startTime;
 for(const p of ordered){
  // Deliberate preceding-interval WALL attribution, retaining the analyzer's
  // weighting convention after chronological normalization. Not DevTools' hit-
  // count self table, pure CPU execution time, or GPU time. Tail stays separate.
  const ms=(p.timestampUs-previous)/1000;previous=p.timestampUs;
  const frame=nodes.get(p.sampleId);
  const label=(frame.functionName||'(anonymous)')+' @ '+(frame.url||'(runtime)')+':'+((frame.lineNumber??-1)+1);
  attributed.set(label,(attributed.get(label)||0)+ms);
 }
 const rows=[...attributed].map(([site,sampledWallMs])=>({site,sampledWallMs})).sort((a,b)=>b.sampledWallMs-a.sampledWallMs);
 const lastTimestampUs=ordered.at(-1).timestampUs,attributedUs=lastTimestampUs-x.startTime,tailUs=x.endTime-lastTimestampUs;
 check(attributedUs+tailUs===x.endTime-x.startTime,'CPU profile exact attribution span plus tail equals profile wall span: '+name);
 const rawMin=Math.min(...points.map(p=>p.timestampUs)),rawMax=Math.max(...points.map(p=>p.timestampUs));
 check(ordered[0].timestampUs===rawMin&&lastTimestampUs===rawMax,'CPU profile sample timestamp span preserved: '+name);
 return {file:name,rawSha256,valid:true,samples:x.samples.length,profileWallMs:(x.endTime-x.startTime)/1000,
  sampledWallAttributedMs:attributedUs/1000,unattributedTailMs:tailUs/1000,
  weighting:'Normalized chronological preceding-sample-interval WALL attribution; not DevTools hit-count self table, pure CPU execution, or GPU time.',
  normalization:{method:'Reconstruct integer absolute microsecond timestamps; stable sort timestamp and sample ID together, original index breaks ties. No raw mutations, clamps, drops, absolute values, or tolerance.',
   source:'https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/models/cpu_profile/CPUProfileDataModel.ts',
   negativeDeltas,reorderedSamples:ordered.filter((p,i)=>p.originalIndex!==i).length,
   profileStartUs:x.startTime,profileEndUs:x.endTime,rawDeltaSumUs:x.timeDeltas.reduce((a,b)=>a+b,0),rawLastTimestampUs:absolute,
   firstTimestampUs:ordered[0].timestampUs,leadingGapUs:ordered[0].timestampUs-x.startTime,leadingGapPolicy:'The profile-start to first-sample interval is attributed to the first chronological sample by this preceding-interval wall convention; its execution stack was not continuously observed.',lastTimestampUs,attributedUs,tailUs,sampleSpanUs:rawMax-rawMin},
  topSampledWall:rows.slice(0,20).map(x=>({...x,sampledSharePct:attributedUs?100*x.sampledWallMs/(attributedUs/1000):null})),
  ownedJsSampledWall:rows.filter(x=>/\/js\/|\bjs\//.test(x.site)).slice(0,15)};
}

check(r.schema==='garage-retry-ab/v1','recognized report schema');
check(r.software===software,software?'input explicitly identifies software pilot':'native mode rejects software input (use --software for a pilot)');
const expectedPairs=software?1:3,expectedEdits=software?2:10,expectedProfiled=software?0:10;
check(r.pairs===expectedPairs&&r.edits===expectedEdits,'expected pair/edit configuration');
check(r.ok===true&&!!r.finished&&!r.error,'harness completed successfully');
check(r.baseline==='e48b3e9038e38126c105c64ac1e59f4bc36f28f7'&&r.candidate==='24cb26e2380f3e954007e5b9b537dbc12da9f3ad','expected exact baseline and candidate revisions');
check(r.arms?.length===expectedPairs*2,'complete arm count');
for(const arm of ['baseline','candidate'])check(Object.keys(r.sourceHashes?.[arm]||{}).length>=5&&Object.values(r.sourceHashes?.[arm]||{}).every(x=>/^[a-f0-9]{64}$/.test(x)),'source hashes recorded for '+arm);
const expectedOrder=Array.from({length:expectedPairs},(_,i)=>(i%2?['candidate','baseline']:['baseline','candidate']).map(arm=>`${i+1}:${arm}`)).flat();
check(json((r.arms||[]).map(a=>`${a.pair}:${a.arm}`))===json(expectedOrder),'counterbalanced arm order is complete and exact');
const arms=[],profiles=[],cameraSignatures=[],qualitySignatures=[],scaleSignatures=[],entryPrebuild=[],stockCameraSignatures=[],stockGeometryKeys=[],stockQualitySignatures=[],stockScaleSignatures=[];
for(const a of r.arms||[]){
 const id=`pair ${a.pair} ${a.arm}`,es=a.edits||[],ps=a.profiledEdits||[];
 check(a.ok===true,id+' completed');
 check(Array.isArray(a.pageErrors)&&!a.pageErrors.length&&Array.isArray(a.consoleErrors)&&!a.consoleErrors.length,id+' has zero page/console errors');
 check(es.length===expectedEdits&&ps.length===expectedProfiled,id+' has exact timed/profiled edit counts');
 check(a.backend?.api==='webgpu'&&!a.backend?.forceWebGL,id+' uses Three WebGPU');
 if(!software)check(a.adapter?.vendor?.toLowerCase()==='apple'&&!a.backend?.softAdapter&&!a.backend?.softBlit,id+' uses Apple native presentation without software adapter/blit');
 const snapshots=['warm','before','after','idleAfterState','final'];
 const reference=a.before;
 for(const label of snapshots){const s=a[label];
  if(!check(!!s,id+' snapshot '+label+' exists'))continue;
  check(s.gpuErrors===0&&s.isWebGPU===true,id+' snapshot '+label+' has zero GPU errors and WebGPU active');
  check(s.camera?.spin===false||s.camera?.spin===0,id+' snapshot '+label+' camera does not spin');
  check(s.finish===true,id+' snapshot '+label+' uses gloss finish');
  check(s.scale?.scale===1&&s.quality?.tierHold===true,id+' snapshot '+label+' holds scale 1 and tier');
  if(reference){check(json(s.camera)===json(reference.camera),id+' snapshot '+label+' matches camera');
   check(json(s.quality)===json(reference.quality)&&json(stableScale(s.scale))===json(stableScale(reference.scale)),id+' snapshot '+label+' matches quality/scale');}
  check(s.allocation?.supported===true,id+' snapshot '+label+' has allocation instrumentation');
  check(allocationKeys.every(k=>num(s.allocation?.[k])),id+' snapshot '+label+' has finite cumulative allocation counters');
 }
 if(reference){cameraSignatures.push(json(reference.camera));qualitySignatures.push(json(reference.quality));scaleSignatures.push(json(stableScale(reference.scale)));}
 for(const [list,name,startIndex]of[[es,'timed',3],[ps,'profiled',3+expectedEdits]])list.forEach((e,i)=>{
  check(e.color===expectedColor(startIndex+i),`${id} ${name} edit ${i+1} has expected deterministic color`);
  check(e.applied?.value?.toLowerCase()===e.color?.toLowerCase()&&expectedRgb(e.color)!==null&&keyRgb(e.applied?.key)===expectedRgb(e.color),`${id} ${name} edit ${i+1} actual geomKey c2 matches RGB`);
  check(e.main===1&&e.render?.mainRenders===1&&e.render?.failedRenderCalls===0,`${id} ${name} edit ${i+1} presents exactly one successful main render`);
  check(json(e.applied?.camera)===json(reference?.camera),`${id} ${name} edit ${i+1} camera matches`);
  check((e.beginPresentMs||[]).length===1&&e.beginPresentMs.every(x=>num(x)&&x>=0)&&num(e.inputToPresentMs)&&e.inputToPresentMs>=0&&num(e.dispatchMs)&&e.dispatchMs>=0,`${id} ${name} edit ${i+1} has finite latency fields`);
 });
 for(const field of ['idleBefore','idleAfter']){
  const w=a[field];check(w?.main===r.idleFrames&&w?.render?.mainRenders===r.idleFrames&&w?.render?.failedRenderCalls===0,id+' '+field+' has expected successful render count');
 }
 if(!software){
  check(a.stockIdle?.main===90&&a.stockIdle?.render?.mainRenders===90&&a.stockIdle?.render?.failedRenderCalls===0,id+' untouched stock idle has exactly 90 successful main renders');
  for(const label of ['stockWarm','stockAfter']){
   const s=a[label];
   if(!check(!!s,id+' '+label+' snapshot exists'))continue;
   check(s.gpuErrors===0&&s.isWebGPU===true,id+' '+label+' has zero GPU errors and WebGPU active');
   check(s.camera?.spin===false||s.camera?.spin===0,id+' '+label+' camera does not spin');
   check(s.scale?.scale===1&&s.quality?.tierHold===true,id+' '+label+' holds scale 1 and tier');
  }
  if(a.stockWarm&&a.stockAfter){
   check(json(a.stockWarm.camera)===json(a.stockAfter.camera),id+' untouched stock camera is stable');
   check(json(a.stockWarm.quality)===json(a.stockAfter.quality)&&json(stableScale(a.stockWarm.scale))===json(stableScale(a.stockAfter.scale)),id+' untouched stock quality/scale is stable');
   check(typeof a.stockWarm.garage?.geomKey==='string'&&a.stockWarm.garage.geomKey.length>0&&a.stockWarm.garage.geomKey===a.stockAfter.garage?.geomKey,id+' untouched stock geomKey is stable');
   stockCameraSignatures.push(json(a.stockWarm.camera));stockGeometryKeys.push(a.stockWarm.garage?.geomKey);
   stockQualitySignatures.push(json(a.stockWarm.quality));stockScaleSignatures.push(json(stableScale(a.stockWarm.scale)));
  }
 }
 const entry=a.entry;
 check(entry?.main===1&&entry?.render?.failedRenderCalls===0&&num(entry?.clickToFirstGaragePresentMs)&&num(entry?.uiReadyMs)&&entry.uiReadyMs>=entry.clickToFirstGaragePresentMs,id+' has valid entry latency fields');
 if(!software)check(!!a.entryBefore?.prebuild&&!!a.entryAfter?.prebuild?.firstFrame,id+' has entry prebuild and built-in firstFrame telemetry');
 entryPrebuild.push({pair:a.pair,arm:a.arm,before:a.entryBefore||null,after:a.entryAfter||null});
 const idleBefore=idle(a.idleBefore),idleAfter=idle(a.idleAfter);
 if(idleBefore&&idleAfter){for(const k of ['drawCallsPerMainRender','trianglesPerMainRender','mainSceneCallsPerRender','mainSceneTrianglesPerRender'])if(idleBefore[k]!==idleAfter[k])warnings.push(`${id}: idle before/after ${k} differs (${idleBefore[k]} -> ${idleAfter[k]}); inspect draw contents.`);}
 const summaries={pair:a.pair,arm:a.arm,timedEdits:{beginPresentMs:stats(es.flatMap(e=>e.beginPresentMs||[])),inputToPresentMs:stats(es.map(e=>e.inputToPresentMs)),dispatchMs:stats(es.map(e=>e.dispatchMs))},
  idleBefore,idleAfter,stockIdle:idle(a.stockIdle),stockSnapshots:{warm:a.stockWarm||null,after:a.stockAfter||null},entry:{latencyScope:software?'software pilot only':'PROFILED exploratory entry latency, includes CDP profiling and polling overhead',...entry,builtInFirstFrame:a.entryAfter?.prebuild?.firstFrame||null},
  allocationTimedEditDelta:delta(a.before?.allocation,a.after?.allocation),allocationAfterIdleDelta:delta(a.before?.allocation,a.idleAfterState?.allocation),allocationThroughProfiledEditsDelta:delta(a.before?.allocation,a.final?.allocation),
  cumulativeAllocation:{before:a.before?.allocation||null,after:a.after?.allocation||null,final:a.final?.allocation||null},geometryObjectCounts:Object.fromEntries(snapshots.map(k=>[k,a[k]?.memory?.geometries??null])),warnings:a.warnings||[]};
 arms.push(summaries);
 for(const kind of ['entry','edits']){const p=profile(`game-garage-${a.pair}-${a.arm}-${kind}.cpuprofile`,!software);if(p)profiles.push({pair:a.pair,arm:a.arm,kind,...p});}
}
check(new Set(cameraSignatures).size===1&&cameraSignatures.length===expectedPairs*2,'camera matches across all arms');
check(new Set(qualitySignatures).size===1&&qualitySignatures.length===expectedPairs*2,'quality matches across all arms');
check(new Set(scaleSignatures).size===1&&scaleSignatures.length===expectedPairs*2,'scale and quality governor fields match across all arms');
if(!software){
 check(stockCameraSignatures.length===expectedPairs*2&&new Set(stockCameraSignatures).size===1,'untouched stock camera matches across all arms');
 check(stockGeometryKeys.length===expectedPairs*2&&new Set(stockGeometryKeys).size===1,'untouched stock geomKey matches across all arms');
 check(stockQualitySignatures.length===expectedPairs*2&&new Set(stockQualitySignatures).size===1,'untouched stock quality matches across all arms');
 check(stockScaleSignatures.length===expectedPairs*2&&new Set(stockScaleSignatures).size===1,'untouched stock scale matches across all arms');
}
const paired=[];
for(let pair=1;pair<=expectedPairs;pair++){
 const b=arms.find(a=>a.pair===pair&&a.arm==='baseline'),c=arms.find(a=>a.pair===pair&&a.arm==='candidate');if(!b||!c)continue;
 const metrics={};for(const[k,get]of Object.entries({...(!software?{stockIdleMs:a=>a.stockIdle?.mainBuildPresentMs.p50}:{}),editBeginPresentMs:a=>a.timedEdits.beginPresentMs.p50,inputToPresentMs:a=>a.timedEdits.inputToPresentMs.p50,dispatchMs:a=>a.timedEdits.dispatchMs.p50,idleBeforeMs:a=>a.idleBefore?.mainBuildPresentMs.p50,idleAfterMs:a=>a.idleAfter?.mainBuildPresentMs.p50,entryClickToPresentProfiledMs:a=>a.entry?.clickToFirstGaragePresentMs,entryUiReadyProfiledMs:a=>a.entry?.uiReadyMs,entryBuiltInTapMs:a=>a.entry?.builtInFirstFrame?.tapMs})){
  const baseline=get(b),candidate=get(c);metrics[k]={baseline,candidate,deltaMs:num(baseline)&&num(candidate)?candidate-baseline:null,reductionPct:num(baseline)&&baseline>0&&num(candidate)?100*(1-candidate/baseline):null};
 }
 const idleParity={};for(const phase of (software?['idleBefore','idleAfter']:['stockIdle','idleBefore','idleAfter'])){idleParity[phase]={};for(const k of ['drawCallsPerMainRender','trianglesPerMainRender','mainSceneCallsPerRender','mainSceneTrianglesPerRender']){
  const before=b[phase]?.[k],after=c[phase]?.[k];idleParity[phase][k]={baseline:before,candidate:after,equal:before===after};if(num(before)&&num(after)&&before!==after)warnings.push(`pair ${pair}: ${phase} ${k} differs across revisions (${before} vs ${after}); investigate geometry and batching, not an automatic quality-equivalence pass.`);
 }}
 if(json(b.geometryObjectCounts)!==json(c.geometryObjectCounts))warnings.push(`pair ${pair}: renderer geometry-object counts differ across revisions; verify intended mesh separation/disposal rather than interpreting object count as triangle count.`);
 paired.push({pair,metrics,idleParity,allocationTimedEditDelta:{baseline:b.allocationTimedEditDelta,candidate:c.allocationTimedEditDelta}});
}
// Entry startup has a different control surface from warmed edit timing.
const entrySignature = a => ({
  prebuilt: a?.entryAfter?.prebuild?.firstFrame?.prebuilt ?? null,
  beforePrebuild: Object.fromEntries(['ready','garageReady','prepped','programsWarm','room'].map(k=>[k,a?.entryBefore?.prebuild?.[k] ?? null])),
  beforeAssets: Object.fromEntries(['uploaded','tier','supported'].map(k=>[k,a?.entryBefore?.assets?.[k] ?? null])),
});
const entrySignatures = (r.arms||[]).map(a=>({pair:a.pair,arm:a.arm,signature:entrySignature(a)}));
const entryPrebuildMatched = entrySignatures.length===expectedPairs*2
  && new Set(entrySignatures.map(x=>json(x.signature))).size===1;
const entryDrawSignature = a => (a?.entry?.render?.rows||[]).map(row=>({name:row.name,width:row.width??null,height:row.height??null,main:!!row.main,renders:row.renders,calls:row.calls,triangles:row.triangles})).sort((a,b)=>json(a).localeCompare(json(b)));
const entryFirstDrawSignatures = (r.arms||[]).map(a=>({pair:a.pair,arm:a.arm,signature:entryDrawSignature(a)}));
const entryFirstDrawMatched=entryFirstDrawSignatures.length===expectedPairs*2&&entryFirstDrawSignatures.every(x=>x.signature.length>0)
 &&new Set(entryFirstDrawSignatures.map(x=>json(x.signature))).size===1;
const entryComparisonMatched = entryPrebuildMatched&&entryFirstDrawMatched;
if(!entryFirstDrawMatched)warnings.push('Entry first-render call/triangle counts or target dimensions differ across arms: entry speedup is not a controlled comparison. Warmed edit validation remains separate.');
if (!entryPrebuildMatched) warnings.push('Entry prewarm/asset state differs across arms: entry paired latencies are not controlled. Warmed edit validation remains separate.');
for (const p of paired) {
  const group=entrySignatures.filter(a=>a.pair===p.pair);
  p.entryPrebuildMatched=group.length===2&&json(group[0].signature)===json(group[1].signature);
  const drawGroup=entryFirstDrawSignatures.filter(a=>a.pair===p.pair);
  p.entryFirstDrawMatched=drawGroup.length===2&&drawGroup.every(x=>x.signature.length>0)&&json(drawGroup[0].signature)===json(drawGroup[1].signature);
  p.entryComparisonMatched=p.entryPrebuildMatched&&p.entryFirstDrawMatched;
}
const pairedAggregate={};for(const key of Object.keys(paired[0]?.metrics||{}))pairedAggregate[key]={baselinePairMedians:stats(paired.map(p=>p.metrics[key].baseline)),candidatePairMedians:stats(paired.map(p=>p.metrics[key].candidate)),pairedReductionPct:stats(paired.map(p=>p.metrics[key].reductionPct))};
const analysis={schema:'garage-retry-analysis/v1',input:file,software,validationPassed:!errors.length,nativeHardwareClaimsAllowed:!software&&!errors.length,
 baseline:r.baseline,candidate:r.candidate,entryMode:r.entryMode||null,entryPrebuildMatched,entryFirstDrawMatched,entryComparisonMatched,entrySignatures,entryFirstDrawSignatures,checks,errors,warnings,paired,pairedAggregate,arms,cpuProfiles:profiles,entryPrebuild,
 limitations:['Allocation bytes are createBuffer descriptor totals minus observed explicit destroy; not resident VRAM or leak proof. Texture allocations are counts only.',
 'Fresh page contexts share one browser and GPU-driver caches. Cold fast tap is not a cleared GPU shader cache.',
 'Entry prewarm parity is reported without requiring assets uploaded=0; network completion may vary. A mismatched entry comparison does not invalidate independently controlled warmed edits.',
 'Timed edits exclude the separate profiled edits. Entry latency is PROFILED exploratory: CDP overhead and UI polling are included; do not present it as clean player latency.',
 'Main begin-to-present durations are synchronous wall times with possible driver submission stalls; not GPU execution times. Cadence under paused/resumed rendering is not player FPS.',
 'Idle draw/triangle differences are flagged for investigation. Matching counts alone do not prove pixels or resource lifetime correctness.',
 'Exact-revision comparison cannot attribute entry changes to any historical DOM suspect. Entry mechanisms are unchanged between these revisions.',
 'CPU profile rows use normalized chronological preceding-sample-interval WALL attribution, including idle/runtime buckets. This is not DevTools hit-count self time, pure CPU execution time, or GPU time. Raw profile SHA256 and negative-delta evidence are retained. The potentially large profile-start to first-sample gap is reported separately and attributed to the first sample by convention; it is not evidence that the first stack executed throughout that gap. No benchmark tolerance or missing-data substitution is used.']};
const f=x=>num(x)?x.toFixed(2):'n/a';
let md=`# Garage retry A/B analysis\n\n${software?'SOFTWARE PILOT — no native performance claims.':'Native Apple Three WebGPU experiment.'}\n\nValidation: **${analysis.validationPassed?'PASS':'FAIL'}**. Native hardware claims allowed: **${analysis.nativeHardwareClaimsAllowed}**.\n\nBaseline: \`${r.baseline}\`\n\nCandidate: \`${r.candidate}\`\n\nEntry mode: ${r.entryMode||'not recorded'}.\n\n`;
if(errors.length)md+='Validation failures:\n\n'+errors.map(x=>'- '+x).join('\n')+'\n\n';
md+='Paired median latency (milliseconds; positive reduction means lower candidate latency):\n\n| Pair | Metric | Baseline | Candidate | Reduction |\n|---|---|---:|---:|---:|\n';
for(const p of paired)for(const[k,v]of Object.entries(p.metrics))md+=`| ${p.pair} | ${k} | ${f(v.baseline)} | ${f(v.candidate)} | ${f(v.reductionPct)}% |\n`;
if(!software){
 md+='\nUntouched first-open stock garage (editor closed; finish control irrelevant):\n\n| Pair / arm | Main renders | Begin-present median ms | Draw calls / main render | Triangles / main render |\n|---|---:|---:|---:|---:|\n';
 for(const a of arms)md+=`| ${a.pair} ${a.arm} | ${a.stockIdle?.mainRenders??'n/a'} | ${f(a.stockIdle?.mainBuildPresentMs.p50)} | ${f(a.stockIdle?.drawCallsPerMainRender)} | ${f(a.stockIdle?.trianglesPerMainRender)} |\n`;
}
md+='\nEntry prebuild matched across arms: **'+entryPrebuildMatched+'**. Entry first draw matched: **'+entryFirstDrawMatched+'**. Entry comparison matched: **'+entryComparisonMatched+'**. '+(entryComparisonMatched?'':'Entry paired latencies are **not controlled**. ')+ 'Entry rows are **profiled exploratory measurements**, not clean player timing. Fresh contexts share browser/GPU-driver caches; cold fast tap does not clear shader caches.\n\nTimed-edit allocation counter deltas:\n\n| Pair / arm | Buffers created | Created bytes | Buffers destroyed | Destroyed bytes | Undestroyed delta | Pipelines sync / async | Shader modules |\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
for(const a of arms){const d=a.allocationTimedEditDelta||{};md+=`| ${a.pair} ${a.arm} | ${d.bufferCreated??'n/a'} | ${d.bufferCreatedBytes??'n/a'} | ${d.bufferDestroyed??'n/a'} | ${d.bufferDestroyedBytes??'n/a'} | ${d.bufferUndestroyedBytes??'n/a'} | ${d.pipelineCreated??'n/a'} / ${d.pipelineAsyncCreated??'n/a'} | ${d.shaderModulesCreated??'n/a'} |\n`;}
md+='\nFull cumulative before/after counters, usage-bitmask deltas, idle parity, prebuild/firstFrame telemetry and paired aggregates are in analysis.json.\n\n';
if(warnings.length)md+='Investigate:\n\n'+warnings.map(x=>'- '+x).join('\n')+'\n\n';
md+='CPU profiles (sampled WALL attribution, not pure CPU execution or DevTools hit-count self time):\n\n';
for(const p of profiles){md+=`- ${p.pair} ${p.arm} ${p.kind}: ${p.samples??0} samples, ${f(p.sampledWallAttributedMs)} ms attributed; profile wall ${f(p.profileWallMs)} ms; leading gap ${f((p.normalization?.leadingGapUs??NaN)/1000)} ms (first-sample attribution by convention, not continuously observed execution); tail ${f(p.unattributedTailMs)} ms. Raw SHA256 \`${p.rawSha256}\`. Negative deltas: ${p.normalization?.negativeDeltas?.length??'invalid profile'}; reordered samples: ${p.normalization?.reorderedSamples??'n/a'}. Top: `+(p.topSampledWall||[]).slice(0,5).map(x=>`${x.site} (${f(x.sampledWallMs)} ms)`).join('; ')+'.\n';}

md+='\nLimitations:\n\n'+analysis.limitations.map(x=>'- '+x).join('\n')+'\n';
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(analysis,null,2));fs.writeFileSync(path.join(dir,'report.md'),md);
console.log(JSON.stringify({validationPassed:analysis.validationPassed,nativeHardwareClaimsAllowed:analysis.nativeHardwareClaimsAllowed,arms:arms.length,errors:errors.length,warnings:warnings.length,analysis:path.join(dir,'analysis.json'),report:path.join(dir,'report.md')}));
if(errors.length)process.exitCode=1;
