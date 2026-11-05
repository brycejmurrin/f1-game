// @doc Build and execute admitted diagnostic tasks without granting publication authority.
/** Fixed command registry for admitted diagnostics. Request inputs are argv data. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { runCommand, executionEnv, setupBundle } from './executor.mjs';
import { DIAGNOSTIC_WORKFLOWS } from './diagnostics.mjs';
const SHA = /^[a-f0-9]{40}$/;
const images = new Set(['ubuntu-latest','ubuntu-24.04','macos-latest','macos-15','macos-14','windows-latest','windows-2022']);
const text = (x, fallback = '') => { const v = String(x ?? fallback); if (v.length > 32768 || /[\0\r\n]/.test(v)) throw new Error('invalid diagnostic value'); return v; };
const bool = x => x === true || x === 'true' || x === '1';
const integer = (x, fallback, min, max) => { const n = x === undefined || x === '' ? fallback : Number(x); if (!Number.isInteger(n) || n < min || n > max) throw new Error('diagnostic number out of bounds'); return n; };
const node = (entry, argv = [], timeoutMinutes = 6, extra = {}) => ({ command: 'node', argv: [entry, ...argv.map(x => text(x))], timeoutMinutes, ...extra });
const npm = (argv, timeoutMinutes = 6, extra = {}) => ({ command: 'npm', argv, timeoutMinutes, ...extra });
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Return the COMPLETE execution plan before reserving any runner capacity. */
export function diagnosticTasks(descriptor, { sourceRoot, sourceSha = descriptor.source_sha, treeSha = sourceSha, baseSha = descriptor.base_sha } = {}) {
  const spec = DIAGNOSTIC_WORKFLOWS[descriptor.workflow];
  if (!spec || !SHA.test(sourceSha || '') || !SHA.test(treeSha || '')) throw new Error('invalid diagnostic identity');
  if (spec.publisher) return [{ id: descriptor.request_id, kind: 'diagnostic', suite: spec.suite, publisher: true,
    runner: 'ubuntu-latest', sourceSha, treeSha, descriptor, commands: [], prerequisites: [], coverageIds: [`publisher:${spec.suite}`], environment:{node:'22',backend:'none',browser:false}, timeoutMinutes: 45, expectedSeconds: 180, setupSeconds: 60 }];
  let inputs = { ...descriptor.inputs };
  if (descriptor.workflow === 'gpu-census.yml' && descriptor.event_name === 'push') {
    if (!sourceRoot) throw new Error('push census requires its immutable source checkout');
    inputs = { ...inputs, ...readJson(path.join(sourceRoot, '.github/gpu-census-request.json')) };
  }
  const tasks = [];
  const add = (suffix, commands, extra = {}) => {
    const timeoutMinutes = 4 + commands.reduce((sum, command) => sum + command.timeoutMinutes, 0);
    if (timeoutMinutes > 45) throw new Error('diagnostic must be split below the 45 minute worker cap');
    const task = { id: `${descriptor.request_id}-${suffix}`, kind: 'diagnostic', suite: spec.suite,
      runner: spec.runner, sourceSha, treeSha, baseSha, descriptor, commands, prerequisites: [],
      coverageIds: [`diagnostic:${descriptor.workflow}:${suffix}`], setupSeconds: 180,
      expectedSeconds: Math.min(timeoutMinutes * 60, 600), timeoutMinutes,
      advisory: !!spec.advisory, environment: { node: '22', renderer: spec.resource_class === 'macos' ? 'hardware' : 'llvmpipe', browser: 'chromium' }, ...extra };
    task.environment = { node: '22', backend: task.environment.renderer === 'hardware' ? 'metal' : task.environment.renderer, ...task.environment };
    task.planDigest = crypto.createHash('sha256').update(JSON.stringify(task)).digest('hex');
    tasks.push(task); return task;
  };
  const out = 'artifacts/actions/diagnostic';
  switch (descriptor.workflow) {
    case 'ci.yml': throw new Error('full validation must use the complete coverage planner');
    case 'browser-group.yml': {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(inputs.group || '')) throw new Error('invalid browser group');
      const plan = inputs.plan ? JSON.parse(inputs.plan) : { matrix: [1,2,3,4].map(shard => ({ shard, total: 4 })) };
      if (!Array.isArray(plan.matrix) || plan.matrix.length < 1 || plan.matrix.length > 8) throw new Error('browser plan requires 1..8 shards');
      const gl = inputs.gl || 'llvmpipe'; if (!['llvmpipe','swiftshader'].includes(gl)) throw new Error('invalid GL stack');
      for (const row of plan.matrix) {
        const total = integer(row.total, 4, 1, 8), shard = integer(row.shard, 1, 1, total);
        const env = { GROUP: inputs.group, PLAN: JSON.stringify(plan), SHARD: String(shard), TOTAL: String(total), WORKERS: '1', GL: gl, APEX_WITH_TWINNED: '1', APEX_FAIL_ON_FLAKY: '1', ...(gl === 'llvmpipe' ? { APEX_GL: gl, LIBGL_ALWAYS_SOFTWARE: '1' } : {}) };
        add(`shard-${shard}`, [node('tools/ci/remote-group.mjs', ['--run-shard'], 35, { env })], { environment: { renderer: gl, browser: inputs.group === 'webkit' ? 'webkit' : 'chromium' } });
      }
      break;
    }
    case 'gpu-census.yml': {
      if (['garage-reanalysis-367dc','garage-reanalysis'].includes(inputs.leg)) {
        const runId=integer(inputs.source_run_id,inputs.leg==='garage-reanalysis-367dc'?39189412012:0,1,Number.MAX_SAFE_INTEGER);
        const expectedRequest=text(inputs.source_request_sha,inputs.leg==='garage-reanalysis-367dc'?'367dc4103ecb14dc5d595dce2bfe813ef884fcaa':'');
        if(!SHA.test(expectedRequest))throw new Error('historical reanalysis needs the captured request SHA');
        const names=[text(inputs.garage_artifact,'garage-retry-ab'),text(inputs.controls_artifact,'gpu-census-macos-latest')];
        if(names.some(name=>!name||name.length>128||!/[a-zA-Z0-9]/.test(name)))throw new Error('invalid historical artifact name');
        const dir=`${out}/historical`;
        add('garage-reanalysis',[
          node('tools/ci/actions/analyze-garage-retry.mjs',[`${dir}/garage`],5,{trustedEntry:true}),
          node('tools/gfx/census-verdict.mjs',['--image','macos-latest','--dir',`${dir}/controls`],1,{trustedEntry:true}),
        ],{runner:'ubuntu-latest',historicalInputs:{runId,expectedRequest,garageArtifact:names[0],controlsArtifact:names[1]},environment:{node:'22',backend:'node',renderer:'node',browser:false}});
        break;
      }
      const picked = String(inputs.images || 'macos-latest').split(',').map(i => i.trim());
      if (new Set(picked).size !== picked.length || picked.some(i => !images.has(i))) throw new Error('invalid GPU image matrix');
      const track = text(inputs.track, 'montreal'), cam = text(inputs.cam, 'helmet'), entry = text(inputs.entry, 'api');
      if (!['helmet','chase','chase>cockpit'].includes(cam) || !['api','menu','menu-full'].includes(entry)) throw new Error('invalid camera/entry');
      const ls = text(inputs.ls).split(/\s+/).filter(Boolean);
      if (ls.some(kv => !/^apex26\.[a-zA-Z0-9._-]+=[^\s]+$/.test(kv))) throw new Error('invalid localStorage controls');
      const common = [track, '--clock', String(integer(inputs.clock, 12, 0, 23)), '--cam', cam, '--entry', entry];
      if (inputs.tod) { if (!['day','night','dawn','dusk'].includes(inputs.tod)) throw new Error('invalid lighting'); common.push('--tod', inputs.tod); }
      if (inputs.force) common.push('--ls', `apex26.tlxForceHw=${text(inputs.force)}`);
      const settings = ['--ls', 'apex26.wgxCapture=0', ...ls.flatMap(x => ['--ls', x])];
      for (const image of picked) {
        const commands = [node('tools/gfx/gpu-census.mjs', ['--json', `census-${image}.json`], 2)];
        if (!bool(inputs.census_only)) {
          for (const [leg, backend, renderer] of [['webgpu','three','webgpu'],['webgl2','three','webgl2'],['glx','webgl2',null],['wgx','webgpu',null]]) {
            commands.push(node('tools/gfx/gpu-game-check.mjs', [...common, '--backend', backend, ...(renderer ? ['--path',renderer] : []), ...settings, '--beats','20','--json',`game-${leg}-${image}.json`, '--shot', `game-${leg}-${image}.png`], 6, { collectFailure: true }));
          }
          commands.push(node('tools/gfx/census-verdict.mjs', ['--image',image,'--ls',ls.join(' ')], 1, { argvAllowsEmpty: true }));
        }
        add(`controls-${image}`, commands, { runner: image });
        if (bool(inputs.relaunch) && !bool(inputs.census_only)) add(`relaunch-${image}`, ['cold','warm'].map(arm => node('tools/gfx/gpu-game-check.mjs', [...common,'--backend','three','--path','webgpu',...settings,'--beats','10','--profile',`${out}/relaunch-profile`,'--port','47610','--json',`game-relaunch-${arm}-${image}.json`],6)), { runner: image });
        const cycles = integer(inputs.mem_cycles,0,0,16);
        if (cycles && !bool(inputs.census_only)) add(`memory-${image}`, ['webgpu','webgl2'].map(renderer => node('tools/gfx/gpu-game-check.mjs',[...common,'--backend','three','--path',renderer,...settings,'--beats','3','--mem-cycles',String(cycles),'--json',`game-memcycles-${renderer}-${image}.json`],14)), { runner: image });
        if (inputs.leg) {
          const legs = {
            'render-live-matrix-2572': node('tools/perf/live-render-matrix.mjs', ['--leg',text(inputs.lrm_leg,'glx'),'--rows',text(inputs.lrm_rows,'1,2,3,4,5'),'--cap-scale',String(Number(inputs.lrm_scale || 2.3)),'--min-frames','2','--json',`${out}/live-matrix.json`],27),
            'garage-livery-perf': node('scratch/garage-livery-census.mjs', [],26),
            'live-frame': node('tools/gfx/live-frame-census.mjs',['--tracks',track,'--backends',text(inputs.lf_backends,'tlx-gl,tlx-gpu'),'--ls',text(inputs.ls),'--json',`${out}/live-frame.json`],27,{ argvAllowsEmpty: true }),
            'garage-retry-63a1': node('scratch/garage-retry-ab.mjs',[],14),
          };
          if (!legs[inputs.leg]) throw new Error('historical reanalysis requires an explicit artifact publisher request');
          add(`experiment-${image}`, [legs[inputs.leg]], { runner: image });
        }
      }
      if (track === 'urban-gallery') add('urban-gallery', [node('tools/gfx/gpu-census.mjs',['--json',`${out}/urban-adapter.json`],2),node('tools/shot/webgpu-urban-gallery.mjs',[],25)], { runner: 'macos-latest' });
      break;
    }
    case 'garage-before.yml':
      add('complete-pack', [node('tools/shot/garage-angles.mjs',['--team=all','--full-views','--views=hero,front,side,rear,top,wingFront,wingRear','--label=0','--sheet=0','--name={team}-{cam}',`--out=${out}/garage-before`],25),node('tools/shot/garage-before.mjs',['--manifest',`--out=${out}/garage-before`,`--sha=${sourceSha}`],1)],{environment:{renderer:'swiftshader',browser:'chromium'}}); break;
    case 'capture-gallery.yml': add('gallery',[node('tools/shot/run-capture-request.mjs',['--plan'],1),node('tools/shot/run-capture-request.mjs',[],14)]); break;
    case 'car-shot.yml': {
      const image = text(inputs.image,'macos-latest'); if (!images.has(image)) throw new Error('invalid car image');
      const argv = [`--team=${text(inputs.team,'mclaren')}`,`--tod=${text(inputs.tod,'day')}`,`--out=${out}/car-shot`,'--w=1100','--h=800', image.startsWith('macos') ? '--gpu=1' : '--gpu=0'];
      if (inputs.livery) argv.push(`--livery=${text(inputs.livery)}`);
      argv.push(inputs.views ? `--views=${text(inputs.views)}` : `--preset=${text(inputs.preset,'cockpit')}`);
      add('car',[node('tools/car/render-car.mjs',argv,20)],{ runner: image, staticServer: true, environment: {renderer:image.startsWith('macos')?'hardware':'llvmpipe',browser:'chromium'} }); break;
    }
    case 'lit-wgsl-advisory.yml':
      if (!SHA.test(baseSha || '')) throw new Error('lit comparison requires immutable base SHA');
      add('compare',[node('tools/perf/lit-wgsl-census.mjs',['advisory','--base','actions-base','--head','.', '--md-out',`${out}/lit-wgsl.md`],25)],{ baseCheckout: baseSha, environment: { renderer: 'lavapipe', browser: 'chromium' } }); break;
    case 'perf-census-webgpu.yml':
      add('pass-scale',[...['chase','helmet'].map(cam => node('tools/gfx/pass-census.mjs',[text(inputs.track,'monaco'),'--webgpu','--camera',cam,'--frames','60','--warm','60','--json',`${out}/pass-${cam}.json`],8)),node('tools/gfx/res-scale-census.mjs',['--track',text(inputs.track,'monaco'),'--webgpu','--json',`${out}/res-scale.json`],8)],{ environment: { renderer: 'lavapipe', browser: 'chromium' } }); break;
    case 'repo-size.yml': add('size',[node('tools/ci/repo-size.mjs',['--top',String(integer(inputs.top,40,1,500)),'--out',`${out}/repo-size.md`],15)],{ fullHistory: true }); break;
    case 'desktop.yml': {
      const platforms = descriptor.event_name === 'pull_request' ? ['ubuntu-latest'] : ['ubuntu-latest','windows-latest','macos-latest'];
      for (const image of platforms) add(`smoke-${image}`,[npm(['ci','--ignore-scripts','--no-audit','--no-fund'],5,{ cwd: 'desktop' }),node('desktop/node_modules/electron/install.js',[],5),npm(['run','pack:test'],15,{ cwd:'desktop' }),npm(['run','fuses:read'],1,{ cwd:'desktop' }),npm(['run','test:electron','--','--workers=1','--retries=0'],15,{ cwd:'desktop',env:{APEX_DESKTOP_SOFT_GL:'1',APEX_DESKTOP_NO_SANDBOX:'1'} })],{runner:image, environment:{renderer:'swiftshader',browser:'electron'}});
      if (descriptor.event_name !== 'pull_request') for (const [image,script] of [['ubuntu-latest','dist:linux'],['windows-latest','dist:win'],['macos-latest','dist:mac']]) add(`installer-${image}`,[npm(['ci','--ignore-scripts','--no-audit','--no-fund'],5,{cwd:'desktop'}),node('desktop/node_modules/electron/install.js',[],5),npm(['run',script],30,{cwd:'desktop'})],{runner:image,unsigned:true});
      break;
    }
    default: throw new Error('no readonly diagnostic executor');
  }
  return tasks;
}

async function serverFor(root) {
  const server = http.createServer((request,response) => {
    try {
      const url = new URL(request.url,'http://localhost');
      let file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root + path.sep)) throw new Error('outside source');
      if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file += '.html';
      if (!fs.realpathSync(file).startsWith(root + path.sep)) throw new Error('evidence path escapes source');
      const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'};
      response.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).on('error',() => { response.statusCode=404;response.end(); }).pipe(response);
    } catch { response.statusCode=404; response.end(); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

/** Execute a canonical task, or an unsplit descriptor, using argv arrays only. */
export async function executeDiagnostic({ descriptor, task, sourceRoot, sourceSha, treeSha, baseSha, run = runCommand, setup = setupBundle, env = {} }) {
  sourceRoot = fs.realpathSync(sourceRoot);
  const tasks = task ? [task] : diagnosticTasks(descriptor,{sourceRoot,sourceSha,treeSha,baseSha});
  if (tasks.some(t => t.publisher)) return {status:'awaiting-trusted-publisher',complete:false,exitCode:1};
  const results=[];
  const safe = executionEnv({},env);
  for (const t of tasks) {
    let server, baseAdded=false, cleanup=()=>{}, taskEnv=safe;
    fs.mkdirSync(path.join(sourceRoot,'artifacts/actions/diagnostic'),{recursive:true});
    try {
      if(t.historicalInputs)await collectHistoricalInputs(t.historicalInputs,{sourceRoot,env,run});
      const prepared=t.historicalInputs?{env:safe,cleanup(){}}:await setup({ ...t, tasks:[t] },{sourceRoot,run,env});
      taskEnv=prepared.env;cleanup=prepared.cleanup || cleanup;
      if(t.environment.browser==='webkit'){const installed=await run('node',['node_modules/playwright/cli.js','install','--with-deps','webkit'],{cwd:sourceRoot,env:taskEnv,timeoutMs:300000});if(installed.exitCode!==0)throw new Error('WebKit installation failed');}
      if(t.environment.backend==='lavapipe' && process.platform==='linux'){const installed=await run('sudo',['apt-get','install','-y','-qq','mesa-vulkan-drivers'],{cwd:sourceRoot,env:taskEnv,timeoutMs:180000});if(installed.exitCode!==0)throw new Error('Vulkan driver installation failed');}
      if (t.baseCheckout) {
        const r=await run('git',['worktree','add','--detach','actions-base',t.baseCheckout],{cwd:sourceRoot,env:safe,timeoutMs:60000});
        if (r.exitCode !== 0) throw new Error('base comparison checkout failed'); baseAdded=true;
      }
      if (t.staticServer) server=await serverFor(fs.realpathSync(sourceRoot));
      for (const command of t.commands) {
        const args=[...command.argv];
        if(command.trustedEntry){
          if(!['tools/ci/actions/analyze-garage-retry.mjs','tools/gfx/census-verdict.mjs'].includes(args[0]))throw new Error('unregistered trusted analyzer');
          args[0]=path.join(fileURLToPath(new URL('../../../',import.meta.url)),args[0]);
        }
        if(server && command.argv[0]==='tools/car/render-car.mjs') args.push(`--url=${server.url}`);
        const cwd=command.cwd ? path.resolve(sourceRoot,command.cwd) : sourceRoot;
        if(cwd!==sourceRoot && !cwd.startsWith(path.resolve(sourceRoot)+path.sep)) throw new Error('unsafe diagnostic cwd');
        const result=await run(command.command,args,{cwd,env:{...taskEnv,...command.env},timeoutMs:command.timeoutMinutes*60000});
        const ok=(result.exitCode ?? result.code)===0 && !result.timedOut && !result.signal && !result.error;
        results.push({taskId:t.id,command:command.command,argv:args,ok,result:{exitCode:result.exitCode??result.code??null,signal:result.signal||null,timedOut:!!result.timedOut,error:result.error?String(result.error).slice(0,4096):null}});
        if(!ok && !command.collectFailure) return {status:'failure',complete:false,exitCode:1,results};
      }
    } finally {
      cleanup();
      if(server) await new Promise(resolve => server.server.close(resolve));
      if(baseAdded) await run('git',['worktree','remove','--force','actions-base'],{cwd:sourceRoot,env:safe,timeoutMs:60000});
      retainEvidence(sourceRoot,t.id);
    }
  }
  return {status:results.every(r=>r.ok)?'success':'failure',complete:results.every(r=>r.ok),exitCode:results.every(r=>r.ok)?0:1,results};
}
function retainEvidence(root,id) {
  const output=path.join(root,'artifacts/actions/diagnostic',id);
  const copy=(source,dest)=>{
    if(!fs.existsSync(source))return;
    const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw new Error('diagnostic evidence symlink rejected');
    if(stat.isDirectory()){fs.mkdirSync(dest,{recursive:true});for(const name of fs.readdirSync(source))copy(path.join(source,name),path.join(dest,name));}
    else if(stat.isFile()){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);}
  };
  for(const relative of ['scratch/renders/cars/ci','scratch/garage-before','artifacts/design-matrix/ci-capture','artifacts/capture-site','desktop/dist','desktop/playwright-report','desktop/test-results'])copy(path.join(root,relative),path.join(output,relative));
  for(const name of fs.readdirSync(root))if(/^(census-|game-|live-frame|live-matrix|analysis|report).*(json|png|webm|md)$/.test(name))copy(path.join(root,name),path.join(output,name));
}
export { executePublisher } from './publisher.mjs';
export { prepareRelease, verifyRelease } from './release.mjs';
export { releaseBase } from './release.mjs';

/** Collect immutable historical input with the outer controller credential.
 * Only data reaches the later token-free analyzer process. */
export async function collectHistoricalInputs(input,{sourceRoot,env={},run=runCommand,fetchImpl=fetch}={}){
  const repository='brycejmurrin/f1-game',token=env.GH_TOKEN||env.GITHUB_TOKEN;
  if(!token)throw new Error('historical input collection needs the readonly controller token');
  const runId=integer(input.runId,0,1,Number.MAX_SAFE_INTEGER);
  if(!SHA.test(input.expectedRequest||''))throw new Error('historical captured request identity is required');
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const api=async tail=>{
    const response=await fetchImpl(`https://api.github.com/repos/${repository}/${tail}`,{headers,signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`historical evidence unavailable (HTTP ${response.status}); select a retained artifact run`);
    return response;
  };
  const producer=await(await api(`actions/runs/${runId}`)).json();
  if(producer.id!==runId||producer.status!=='completed'||producer.repository?.full_name!==repository||!SHA.test(producer.head_sha||''))throw new Error('historical producer identity mismatch');
  const listed=await(await api(`actions/runs/${runId}/artifacts?per_page=100`)).json();
  const root=path.join(sourceRoot,'artifacts/actions/diagnostic/historical');
  if(fs.existsSync(root))throw new Error('historical input destination already exists');
  fs.mkdirSync(root,{recursive:true});
  const receipt={runId,producerSha:producer.head_sha,artifacts:[]};
  for(const [name,dest]of [[input.garageArtifact,'garage'],[input.controlsArtifact,'controls']]){
    const hits=(listed.artifacts||[]).filter(a=>a.name===name&&!a.expired&&Number(a.workflow_run?.id)===runId);
    if(hits.length!==1||!Number.isSafeInteger(hits[0].id)||!/^sha256:[a-f0-9]{64}$/.test(hits[0].digest||''))throw new Error('select exactly one retained artifact with a verifiable digest');
    const artifact=hits[0],response=await api(`actions/artifacts/${artifact.id}/zip`);
    if(Number(response.headers.get('content-length')||0)>256*1024*1024)throw new Error('historical artifact exceeds collection budget');
    const chunks=[];let size=0;
    for await(const bytes of response.body){size+=bytes.length;if(size>256*1024*1024)throw new Error('historical artifact exceeds collection budget');chunks.push(bytes);}
    const data=Buffer.concat(chunks),digest=`sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
    if(digest!==artifact.digest)throw new Error('historical artifact archive digest mismatch');
    const zip=path.join(root,`${artifact.id}.zip`),target=path.join(root,dest);fs.writeFileSync(zip,data);fs.mkdirSync(target);
    const result=await run('python3',['-c',HISTORICAL_ZIP_EXTRACT,zip,target],{cwd:sourceRoot,env:executionEnv({},env),timeoutMs:120000});
    if((result.exitCode??result.code)!==0||result.error||result.timedOut||result.signal)throw new Error('historical artifact extraction rejected');
    fs.rmSync(zip);receipt.artifacts.push({id:artifact.id,name,digest});
  }
  const garage=path.join(root,'garage'),capture=JSON.parse(fs.readFileSync(path.join(garage,'game-garage-retry-ab.json'),'utf8'));
  if(capture.request!==input.expectedRequest||capture.schema!=='garage-retry-ab/v1')throw new Error('historical captured request provenance mismatch');
  for(const name of ['analysis.json','report.md'])fs.copyFileSync(path.join(garage,name),path.join(garage,name.replace('.', '.original.')),fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(root,'verified-input.json'),JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
const HISTORICAL_ZIP_EXTRACT=`import sys, stat, zipfile\nfrom pathlib import PurePosixPath\nwith zipfile.ZipFile(sys.argv[1]) as z:\n if len(z.infolist()) > 20000 or sum(i.file_size for i in z.infolist()) > 512*1024*1024: raise ValueError('historical artifact expanded budget exceeded')\n for i in z.infolist():\n  p=PurePosixPath(i.filename.replace('\\\\','/'))\n  if p.is_absolute() or '..' in p.parts or stat.S_ISLNK((i.external_attr>>16)&0o170000): raise ValueError('unsafe historical archive path')\n z.extractall(sys.argv[2])\n`;
