// @doc Continue an admitted release with trusted artifact staging, publication and live-commit checks.
/** Trusted release continuation. The task source is data, never an executable checkout. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const SHA=/^[a-f0-9]{40}$/;
const PAGE='https://brycejmurrin.github.io/f1-game/';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const ancestor=(root,a,b)=>{try{git(root,['merge-base','--is-ancestor',a,b]);return true;}catch{return false;}};

/** CLI must prove the canonical lease and every required coverage receipt first. */
export async function prepareRelease({ sourceRoot, trustedRoot, sourceSha, treeSha, pageUrl=PAGE, fetchImpl=fetch, stage, stamp, buildFor, now=Date.now }={}) {
  if(pageUrl!==PAGE||!SHA.test(sourceSha||'')||!SHA.test(treeSha||''))throw new Error('invalid release identity');
  sourceRoot=fs.realpathSync(sourceRoot);trustedRoot=fs.realpathSync(trustedRoot);
  if(git(sourceRoot,['rev-parse','HEAD'])!==sourceSha||git(sourceRoot,['rev-parse','HEAD^{tree}'])!==treeSha)throw new Error('release checkout differs from complete coverage source');
  const trustedSha=git(trustedRoot,['rev-parse','HEAD']);
  if(!ancestor(sourceRoot,sourceSha,trustedSha))throw new Error('release source is not an ancestor of the protected controller revision');
  const stagingInputs=git(sourceRoot,['diff','--name-only',sourceSha,trustedSha,'--','tools/desktop','tools/gen','tools/lib','tools/manifest.cjs','tools/ci/bump-cache.mjs','desktop/lib','package.json','package-lock.json']);
  if(stagingInputs)throw new Error('staging implementation changed after the tested release; admit a fresh release tree');
  // Called while the Actions release job holds the one Pages lock. Unknown
  // live ancestry refuses publication; this is the final decision before bytes.
  const response=await fetchImpl(`${PAGE}index.html?__release=${now()}`,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('cannot read live release provenance under Pages lock');
  const html=await response.text(), live=/<meta name="apex-sha" content="([a-f0-9]{40})">/.exec(html)?.[1];
  if(!live)throw new Error('live release provenance unreadable under Pages lock');
  let publish=true, outcome='publish';
  if(live===sourceSha){publish=false;outcome='already-live';}
  else if(ancestor(sourceRoot,sourceSha,live)){publish=false;outcome='superseded';}
  else if(!ancestor(sourceRoot,live,sourceSha))throw new Error('release would move Pages backwards or diverge');
  const module=stage && stamp && buildFor ? {} : await import(pathToFileURL(path.join(trustedRoot,'tools/desktop/stage.mjs')).href);
  const build=(buildFor||module.pagesBuild)({root:sourceRoot});
  const stagedRoot=path.join(trustedRoot,'artifacts/actions/release/site');
  // Implementations and their generator imports come from trustedRoot; root
  // is merely the source-data argument. No source npm script is executed here.
  await (stage||module.stageSiteMinified)(stagedRoot,{root:sourceRoot});
  (stamp||module.stampStaged)(stagedRoot,{root:sourceRoot,sha:sourceSha,at:build});
  const result={publish,outcome,sourceSha,treeSha,build,stagedRoot,pageUrl:PAGE};
  fs.writeFileSync(path.join(trustedRoot,'artifacts/actions/release/prepared.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}

/** Verifies the SAME staged bytes after deploy; never rebuilds at a newer ref. */
export async function verifyRelease({ sourceRoot, trustedRoot, prepared, deploymentResult, pageUrl=PAGE, poll, verify }={}) {
  if(pageUrl!==PAGE||!prepared||!SHA.test(prepared.sourceSha||'')||!SHA.test(prepared.treeSha||''))throw new Error('invalid prepared release');
  sourceRoot=fs.realpathSync(sourceRoot);trustedRoot=fs.realpathSync(trustedRoot);
  if(prepared.publish&&deploymentResult!=='success')throw new Error('Pages deployment did not succeed');
  const stagedRoot=path.join(trustedRoot,'artifacts/actions/release/site');
  if(prepared.stagedRoot!==stagedRoot||git(sourceRoot,['rev-parse','HEAD'])!==prepared.sourceSha||git(sourceRoot,['rev-parse','HEAD^{tree}'])!==prepared.treeSha)throw new Error('prepared release source changed');
  const poller=poll ? {} : await import(pathToFileURL(path.join(trustedRoot,'tools/ci/poll-live-shell.mjs')).href);
  const checker=verify ? {} : await import(pathToFileURL(path.join(trustedRoot,'tools/ci/verify-live.mjs')).href);
  const live=await (poll||poller.pollLiveShell)({pageUrl,build:prepared.build,sha:prepared.sourceSha,isAncestor:(a,b)=>ancestor(sourceRoot,a,b)});
  if(!live.ok)throw new Error('live Pages shell did not reach the tested release');
  if(live.outcome==='match'){
    const bytes=await (verify||checker.verifyLive)({baseUrl:pageUrl,root:stagedRoot});
    if(!bytes.ok)throw new Error('published runtime bytes do not match tested release artifact');
  }
  return {status:'success',complete:true,exitCode:0,sourceSha:prepared.sourceSha,treeSha:prepared.treeSha,build:prepared.build,outcome:live.outcome};
}

/** Cheap admission verdict. An unknown live base selects exhaustive coverage. */
export async function releaseBase({ sourceRoot, sourceSha, pageUrl=PAGE, fetchImpl=fetch }={}) {
  if(pageUrl!==PAGE||!SHA.test(sourceSha||''))throw new Error('invalid release base identity');
  sourceRoot=fs.realpathSync(sourceRoot);
  if(git(sourceRoot,['rev-parse','HEAD'])!==sourceSha)throw new Error('release base source checkout mismatch');
  try{
    const response=await fetchImpl(`${PAGE}index.html?__admission=${Date.now()}`,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)return{alreadyLive:false,baseSha:null};
    const html=await response.text();
    const live=/<meta name="apex-sha" content="([a-f0-9]{40})">/.exec(html)?.[1];
    if(!live)return{alreadyLive:false,baseSha:null};
    if(live===sourceSha)return{alreadyLive:true,baseSha:live};
    return{alreadyLive:false,baseSha:ancestor(sourceRoot,live,sourceSha)?live:null};
  }catch{return{alreadyLive:false,baseSha:null};}
}
