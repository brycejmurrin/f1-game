// @doc Publish admitted workflow artifacts through the trusted release boundary.
/** Privileged publication from protected controller code only. No PR scripts. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runCommand, executionEnv } from './executor.mjs';
import { DIAGNOSTIC_WORKFLOWS } from './diagnostics.mjs';
const SHA = /^[a-f0-9]{40}$/;
const BASE = 'claude/f1-game-project-26h3ng';
const number = (v,fallback,min,max) => {const n=Number(v ?? fallback);if(!Number.isInteger(n)||n<min||n>max)throw new Error('publisher number out of bounds');return n;};
const scalar = (v,fallback='') => {const s=String(v ?? fallback);if(s.length>32768||/[\0\r\n]/.test(s))throw new Error('invalid publisher input');return s;};
const branchName = name => {if(!/^bot\/[a-z0-9][a-z0-9._/-]{0,150}$/.test(name)||name.includes('..')||name.endsWith('/'))throw new Error('publisher requires a bot branch');return name;};
const allFiles = root => fs.existsSync(root) ? fs.readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?allFiles(path.join(root,x.name)):x.isFile()?[path.join(root,x.name)]:[]) : [];

export async function executePublisher(descriptor, { trustedRoot, run=runCommand, env={}, ledger }={}) {
  if(!DIAGNOSTIC_WORKFLOWS[descriptor.workflow]?.publisher)throw new Error('not a registered publisher');
  trustedRoot=fs.realpathSync(trustedRoot);
  const supplied={...executionEnv({},env),GH_TOKEN:env.GH_TOKEN||env.GITHUB_TOKEN||'',GITHUB_TOKEN:env.GITHUB_TOKEN||env.GH_TOKEN||'',GITHUB_REPOSITORY:env.GITHUB_REPOSITORY||'brycejmurrin/f1-game',CI:'true'};
  if(supplied.GITHUB_REPOSITORY!=='brycejmurrin/f1-game')throw new Error('publisher repository mismatch');
  const commands=[];
  const call=async(command,argv,{cwd=trustedRoot,minutes=10,allowFailure=false,extraEnv={}}={})=>{
    const result=await run(command,argv,{cwd,env:{...supplied,...extraEnv},timeoutMs:minutes*60000});
    commands.push({command,argv,exitCode:result.exitCode??result.code});
    if(!allowFailure&&((result.exitCode??result.code)!==0||result.error||result.timedOut||result.signal))throw new Error(`trusted publisher command failed: ${command} ${argv.slice(0,2).join(' ')}`);
    return result;
  };
  const head=String((await call('git',['rev-parse','HEAD'])).stdout || '').trim();
  if(!SHA.test(descriptor.source_sha||'')||head!==descriptor.source_sha)throw new Error('publisher source must equal protected executor checkout');
  const inputs=descriptor.inputs||{}, out=path.join(trustedRoot,'artifacts/actions/publisher');fs.mkdirSync(out,{recursive:true});
  const json=async args=>JSON.parse((await call('gh',args)).stdout);
  const auth=async()=>{await call('gh',['auth','setup-git']);await call('git',['config','user.name','apex-actions-bot']);await call('git',['config','user.email','noreply@users.noreply.github.com']);};
  const commitPR=async(name,paths,title,body)=>{
    await auth();branchName(name);
    const existing=await json(['pr','list','--state','open','--head',name,'--json','number']);
    if(existing.length)return {unchanged:true,pr:existing[0].number};
    const dirty=await call('git',['status','--porcelain','--',...paths]);if(!dirty.stdout?.trim())return {unchanged:true};
    await call('git',['checkout','-b',name]);await call('git',['add','-A','--',...paths]);
    await call('git',['-c','core.hooksPath=/dev/null','commit','-m',title]);await call('git',['-c','core.hooksPath=/dev/null','push','origin',`HEAD:refs/heads/${name}`]);
    const created=await call('gh',['pr','create','--base',BASE,'--head',name,'--title',title,'--body',body]);
    return {prUrl:created.stdout?.trim(),validation:'awaiting-coordinator-coverage'};
  };
  let publication={};
  switch(descriptor.workflow){
    case 'flake-tally.yml':{
      const args=['tools/ci/flake-tally.mjs'];
      if(inputs.mode==='base-red'||descriptor.schedule==='17 */2 * * *')args.push('--base-red','--hours','3','--issue');
      else args.push('--events','all','--days',String(number(inputs.days,2,1,30)),'--propose','--issue');
      await call('node',args,{minutes:20});break;
    }
    case 'changelog-fold.yml':
      await call('node',['tools/gen/gen-changelog.mjs','--check']);await call('npm',['run','-s','fold']);await call('node',['tools/gen/gen-changelog.mjs','--check']);
      publication=await commitPR('bot/changelog-fold',['CHANGELOG.md','docs/changelog.d'],'chore(changelog): fold landed fragments','Protected Actions maintenance. Fragment validation passed; full affected-test coverage remains pending until the coordinator records its receipt.');break;
    case 'ratchets-fold.yml':
      await call('node',['tools/check/ratchets.mjs','--fold',`--min-fragments=${number(inputs.min_fragments,20,1,10000)}`]);await call('node',['tools/check/ratchets.mjs']);await call('npm',['run','-s','gen']);
      publication=await commitPR(`bot/ratchets-fold-${head.slice(0,12)}`,['tests/data','docs/agent-index.json','docs/notes/CEILING-HISTORY.md'],'chore(ratchets): fold ratchet fragments','Protected Actions maintenance. Effective ceilings were validated unchanged; coordinator validation is required.');break;
    case 'knowledge-gc.yml':
      await call('node',['tools/docs/knowledge-gc.mjs','--apply',`--days=${number(inputs.days,21,1,3650)}`]);await call('node',['--test','tests/unit/knowledge-retention.test.mjs','tests/unit/docs-integrity.test.mjs']);
      publication=await commitPR(`bot/knowledge-gc-${head.slice(0,12)}`,['docs'],'docs(notes): archive stale uncited notes','Protected Actions retention pass. Retention and link integrity passed; coordinator validation remains required.');break;
    case 'process-dashboard.yml':{
      const record=path.join(out,'process-dashboard.json'), markdown=path.join(out,'process-dashboard.md');
      await call('node',['tools/ci/process-dashboard.mjs','--runs','60','--out',record,'--md',markdown,'--baseline'],{minutes:20});
      const check=await call('node',['tools/ci/process-dashboard.mjs','--check',record],{allowFailure:true});publication.ratchetBreach=(check.exitCode??check.code)!==0;
      await auth();await publishFiles('metrics',{'process-dashboard.json':record,'process-dashboard.md':markdown},call);break;
    }
    case 'spec-timings.yml':{
      let runId=descriptor.producer_run_id||inputs.run_id;
      if(!runId){const runs=await json(['run','list','--workflow','pages.yml','--branch',BASE,'--status','success','--limit','1','--json','databaseId']);runId=runs[0]?.databaseId;}
      runId=number(runId,0,1,Number.MAX_SAFE_INTEGER);
      const producer=await json(['api',`repos/${supplied.GITHUB_REPOSITORY}/actions/runs/${runId}`]);
      if(producer.head_branch!==BASE||!['.github/workflows/pages.yml','.github/workflows/actions-worker.yml'].includes(producer.path)||producer.status!=='completed'||producer.conclusion!=='success')throw new Error('timings producer is not a successful trusted train/worker');
      let selected;
      if(producer.path==='.github/workflows/actions-worker.yml'){
        if(!ledger)throw new Error('worker timings require canonical ledger proof');
        const wave=Object.values(ledger.waves||{}).find(w=>String(w.owner?.runId)===String(runId)&&Number(w.owner?.runAttempt)===producer.run_attempt);
        if(!wave||wave.status!=='completed')throw new Error('worker timings await canonical terminal observations');
        selected=wave.tasks.flatMap(entry=>{
          const request=ledger.requests[entry.requestId], task=request?.tasks.find(t=>t.id===entry.taskId), result=request?.results[entry.taskId];
          if(request?.kind!=='release'||!task?.environment?.browser||task.environment.backend!=='llvmpipe'||result?.status!=='success'||!result.complete)return[];
          if(result.sourceSha!==request.sourceSha||result.treeSha!==request.treeSha||result.planDigest!==request.planDigest)throw new Error('timings receipt differs from release source');
          const id=crypto.createHash('sha256').update(JSON.stringify({waveId:wave.id,requestId:request.id,taskId:task.id})).digest('hex').slice(0,24);
          return [`spec-timings-junit-${id}-${producer.run_attempt}`];
        });
        if(!selected.length)return {status:'success',complete:true,exitCode:0,publication:{noMeasurements:true},commands};
      }
      const target='tests/data/spec-timings.json';
      const previous=await call('git',['fetch','origin','bot/spec-timings'],{allowFailure:true});
      if((previous.exitCode??previous.code)===0){const record=await call('git',['show',`FETCH_HEAD:${target}`]);JSON.parse(record.stdout);fs.writeFileSync(path.join(trustedRoot,target),record.stdout);}
      const incoming=path.join(out,'junit');fs.mkdirSync(incoming,{recursive:true});
      if(selected)for(const artifact of selected)await call('gh',['run','download',String(runId),'--name',artifact,'--dir',path.join(incoming,artifact)]);
      else await call('gh',['run','download',String(runId),'--pattern','spec-timings-junit-*','--dir',incoming]);
      const files=allFiles(incoming).filter(p=>path.basename(p)==='junit.xml');if(!files.length)return {status:'success',complete:true,exitCode:0,publication:{noMeasurements:true},commands};
      await call('node',['tools/ci/spec-timings.mjs',...files],{extraEnv:{APEX_GL:'llvmpipe'}});
      await auth();await publishFiles('bot/spec-timings',{[target]:path.join(trustedRoot,target)},call);break;
    }
    case 'prune-branches.yml':{
      const prs=path.join(out,'prs.json'),runs=path.join(out,'runs.json');
      fs.writeFileSync(prs,JSON.stringify(await json(['pr','list','--state','all','--limit','5000','--json','number,state,headRefName,headRefOid,title,mergedAt,closedAt,createdAt'])));
      fs.writeFileSync(runs,JSON.stringify(await json(['run','list','--limit','2000','--json','headSha,conclusion,status,workflowName,createdAt'])));
      await auth();await call('git',['fetch','origin','+refs/heads/*:refs/remotes/origin/*']);
      const args=['tools/ci/prune-branches.mjs','--base',BASE,'--default',BASE,'--min-age-days',String(number(inputs.min_age_days,1,1,3650)),'--quiet-hours',String(number(inputs.quiet_hours,48,1,87600)),'--prs',prs,'--runs',runs,'--report',path.join(out,'branch-audit.md'),'--json',path.join(out,'branch-audit.json')];
      if(inputs.keep)args.push('--keep',scalar(inputs.keep));if(inputs.also)args.push('--also',scalar(inputs.also));if(inputs.apply===true||inputs.apply==='true')args.push('--apply');
      await call('node',args,{minutes:30});break;
    }
    case 'archive-evidence.yml':{
      const tools=await import(pathToFileURL(path.join(trustedRoot,'tools/shot/publish-evidence.mjs')).href);
      const history=await import(pathToFileURL(path.join(trustedRoot,'tools/shot/export-history-evidence.mjs')).href);
      let captureSha,producer;
      const capture=fs.mkdtempSync(path.join(os.tmpdir(),'actions-evidence-'));
      if(inputs.source_commit){captureSha=scalar(inputs.source_commit);if(!SHA.test(captureSha))throw new Error('historical capture needs a full SHA');}
      else {const id=number(inputs.run_id,0,1,Number.MAX_SAFE_INTEGER);producer=await json(['api',`repos/${supplied.GITHUB_REPOSITORY}/actions/runs/${id}`]);if(producer.status!=='completed'||producer.repository?.full_name!==supplied.GITHUB_REPOSITORY||!SHA.test(producer.head_sha))throw new Error('invalid capture producer');captureSha=producer.head_sha;}
      await call('git',['worktree','add','--detach',capture,captureSha]);
      try{
        const dir=path.join(capture,'artifacts/promoted-evidence');
        let linkableFiles;
        if(inputs.source_commit){const paths=history.validateHistorySelection(captureSha,JSON.parse(inputs.source_paths||'[]'));const exported=history.exportHistoryEvidence({root:capture,sha:captureSha,paths});if(inputs.direct_images===true||inputs.direct_images==='true')linkableFiles=exported.origin.files.filter(f=>/\.(png|jpe?g|webp|gif|avif)$/i.test(f.path)).map(f=>f.path);}
        else{if(inputs.direct_images===true||inputs.direct_images==='true')throw new Error('direct_images applies to historical Git evidence');const download=fs.mkdtempSync(path.join(os.tmpdir(),'actions-artifact-'));await call('gh',['run','download',String(producer.id),'--name',scalar(inputs.artifact_name),'--dir',download]);fs.mkdirSync(path.dirname(dir),{recursive:true});fs.cpSync(download,dir,{recursive:true,dereference:false,errorOnExist:true,force:false});fs.writeFileSync(path.join(dir,'_evidence-promotion.json'),JSON.stringify({workflowRunHeadSha:producer.head_sha,runId:producer.id,runAttempt:producer.run_attempt,captureSourceSha:null,captureSourceVerification:'unverified; consult producer metadata'}),{flag:'wx'});}
        const prepared=tools.prepareEvidence({root:capture,dir,label:scalar(inputs.label),linkableFiles});
        // The trusted helper's gh subprocess receives only this publisher's token.
        const previous=process.env.GH_TOKEN;try{process.env.GH_TOKEN=supplied.GH_TOKEN;publication=tools.publishEvidence(prepared.receiptPath);}finally{if(previous===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=previous;}
      }finally{await call('git',['worktree','remove','--force',capture],{allowFailure:true});}
      break;
    }
    case 'import-models.yml':{
      // Download and extraction are controlled by this code; imported files are data.
      const url=new URL(scalar(inputs.url));if(url.protocol!=='https:')throw new Error('model URL must use HTTPS');
      const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('model download failed');
      if(Number(response.headers.get('content-length')||0)>64*1024*1024)throw new Error('model archive too large');
      const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>64*1024*1024)throw new Error('model archive too large');chunks.push(chunk);}
      const data=Buffer.concat(chunks), download=path.join(out,'models.bin'), extract=path.join(out,'models');fs.writeFileSync(download,data);fs.mkdirSync(extract,{recursive:true});
      if(data.subarray(0,2).toString()==='PK')await call('python3',['-c',ZIP_EXTRACT,download,extract]);else fs.writeFileSync(path.join(extract,data.subarray(0,1).toString()==='{'?'model.gltf':'model.glb'),data);
      const branch=branchName(scalar(inputs.commit_branch,'bot/model-import'));
      await call('node',['tools/gen/import-models.mjs',extract,'--mat',scalar(inputs.mat,'CONCRETE'),'--height',scalar(inputs.height,'12'),'--scale',scalar(inputs.scale,'0'),'--prefix',scalar(inputs.prefix,'q_'),'--author',scalar(inputs.author,'Quaternius'),'--source',url.origin+url.pathname]);
      const warnings=[];for(const leg of ['credits','verify']){const result=await call('node',['tools/gen/assets.mjs',leg],{allowFailure:true});if((result.exitCode??result.code)!==0)warnings.push(leg);}
      await call('node',['tools/gen/gen-shell.mjs','--check']);await auth();
      const exists=await call('git',['ls-remote','--exit-code','--heads','origin',branch],{allowFailure:true});let lease;
      if((exists.exitCode??exists.code)===0){await call('git',['fetch','--no-tags','--depth=1','origin',branch]);const author=(await call('git',['log','-1','--format=%an','FETCH_HEAD'])).stdout.trim();if(author!=='apex-model-bot')throw new Error('model destination belongs to another owner');lease=(await call('git',['rev-parse','FETCH_HEAD'])).stdout.trim();}
      await call('git',['config','user.name','apex-model-bot']);await call('git',['checkout','-B',branch]);await call('git',['add','assets/pack/models','assets/pack/manifest.json','assets/pack/CREDITS.md']);
      const dirty=await call('git',['diff','--cached','--quiet'],{allowFailure:true});if((dirty.exitCode??dirty.code)!==0){await call('git',['-c','core.hooksPath=/dev/null','commit','-m',`chore(assets): import models from ${url.origin}${url.pathname}`]);await call('git',['-c','core.hooksPath=/dev/null','push',...(lease?[`--force-with-lease=${branch}:${lease}`]:[]),'origin',branch]);}publication={branch,warnings};break;
    }
    default:throw new Error('publisher has no trusted implementation');
  }
  return {status:'success',complete:true,exitCode:0,publication,commands};
}

async function publishFiles(branch,files,call){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'actions-record-'));
  await call('git',['init','-q'],{cwd:dir});await call('git',['remote','add','origin','https://github.com/brycejmurrin/f1-game.git'],{cwd:dir});
  const existing=await call('git',['fetch','--depth=1','origin',branch],{cwd:dir,allowFailure:true});
  if((existing.exitCode??existing.code)===0)await call('git',['checkout','--detach','FETCH_HEAD'],{cwd:dir});
  await call('git',['config','user.name','apex-actions-bot'],{cwd:dir});await call('git',['config','user.email','noreply@users.noreply.github.com'],{cwd:dir});
  for(const [dest,source]of Object.entries(files)){const target=path.join(dir,dest);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
  await call('git',['add','--',...Object.keys(files)],{cwd:dir});const dirty=await call('git',['diff','--cached','--quiet'],{cwd:dir,allowFailure:true});if((dirty.exitCode??dirty.code)===0)return;
  await call('git',['commit','-m','chore(metrics): merge admitted evidence'],{cwd:dir});await call('git',['push','origin',`HEAD:refs/heads/${branch}`],{cwd:dir});
}
const ZIP_EXTRACT=`import sys, stat, zipfile\nfrom pathlib import PurePosixPath\nwith zipfile.ZipFile(sys.argv[1]) as z:\n for i in z.infolist():\n  p=PurePosixPath(i.filename.replace('\\\\','/'))\n  if p.is_absolute() or '..' in p.parts or stat.S_ISLNK((i.external_attr>>16)&0o170000): raise ValueError('unsafe archive entry')\n if sum(i.file_size for i in z.infolist()) > 256*1024*1024: raise ValueError('expanded model archive too large')\n z.extractall(sys.argv[2])\n`;
