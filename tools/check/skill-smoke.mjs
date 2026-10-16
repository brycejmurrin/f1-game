#!/usr/bin/env node
// @doc Plan or execute one bounded offline contract per canonical skill; retain explicit unverified browser/device scope.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseDocument } from 'yaml';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execute = promisify(execFile);
export function parseArgs(argv) {
  const out = {mode:null,skill:null,all:false,help:false};
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg==='--help') out.help=true;
    else if (arg==='--all') out.all=true;
    else if (arg==='--skill') { const value=argv[++i]; if (!value || value.startsWith('-')) throw new Error('--skill requires a canonical name'); out.skill=value; }
    else if (arg==='--plan'||arg==='--check') { if(out.mode) throw new Error('Choose exactly one of --plan and --check'); out.mode=arg.slice(2); }
    else throw new Error('Unknown argument: '+arg);
  }
  if (!out.help && (!out.mode || out.all===Boolean(out.skill))) throw new Error('Choose --skill NAME or --all and --plan or --check');
  return out;
}
export function validateCatalog(catalog,root=ROOT) {
  if(catalog.schemaVersion!==1 || !Array.isArray(catalog.recipes)) throw new Error('Invalid recipe schema');
  const canonical=fs.readdirSync(path.join(root,'.claude/skills'),{withFileTypes:true}).filter(e=>e.isDirectory()&&fs.existsSync(path.join(root,'.claude/skills',e.name,'SKILL.md'))).map(e=>e.name).sort();
  const seen=new Set();
  for (const r of catalog.recipes) {
    if (seen.has(r.skill)||!canonical.includes(r.skill)) throw new Error('Duplicate or unknown skill: '+r.skill);seen.add(r.skill);
    const skill=fs.readFileSync(path.join(root,'.claude/skills',r.skill,'SKILL.md'),'utf8');
    const fm=skill.match(/^---\r?\n([\s\S]*?)\r?\n---/);if(!fm) throw new Error(r.skill+': missing YAML metadata');
    const yaml=parseDocument(fm[1]);const data=yaml.toJS();
    if(yaml.errors.length||!data||data.name!==r.skill||typeof data.description!=='string') throw new Error(r.skill+': invalid YAML metadata');
    if(typeof r.task!=='string'||!r.task.trim()||!/^tests\/unit\/[a-z0-9-]+\.test\.mjs$/.test(r.fixture)||!fs.existsSync(path.join(root,r.fixture))) throw new Error(r.skill+': missing bounded fixture');
    if(typeof r.pattern!=='string'||!r.pattern.trim()) throw new Error(r.skill+': empty selection');
    new RegExp(r.pattern);
    if(!Number.isInteger(r.timeoutMs)||r.timeoutMs<1||r.timeoutMs>15000||!Number.isInteger(r.expected?.minPass)||r.expected.minPass<1||r.expected?.maxFail!==0) throw new Error(r.skill+': invalid bounds or expected result');
    if(!Array.isArray(r.prerequisites)||!r.prerequisites.length||!Array.isArray(r.followups)||!r.followups.some(f=>f.kind==='browser'&&f.status==='unverified')||!r.followups.some(f=>f.kind==='hardware'&&f.status==='unverified')) throw new Error(r.skill+': missing evidence boundary');
  }
  if(canonical.some(s=>!seen.has(s))) throw new Error('Catalog does not cover every canonical skill');
  return catalog.recipes;
}
export function loadRecipes(root=ROOT) { return validateCatalog(JSON.parse(fs.readFileSync(path.join(root,'tools/check/skill-smoke-recipes.json'),'utf8')),root); }
export function planRecipe(r) { return {...r,argv:[process.execPath,'--test','--test-reporter=tap','--test-name-pattern='+r.pattern,r.fixture],status:'planned',performed:false}; }
export async function checkRecipe(r,root=ROOT,runner=execute) {
  const planned=planRecipe(r);let stdout='',stderr='',failure=null;
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  try { const result=await runner(planned.argv[0],planned.argv.slice(1),{cwd:root,env,timeout:r.timeoutMs,maxBuffer:512*1024,killSignal:'SIGTERM'});stdout=result.stdout||'';stderr=result.stderr||''; }
  catch(error) { stdout=error.stdout||'';stderr=error.stderr||'';failure=error.killed?'timeout':String(error.message); }
  const pass=Number(stdout.match(/^# pass (\d+)$/m)?.[1]||0),fail=Number(stdout.match(/^# fail (\d+)$/m)?.[1]||0);
  const ok=!failure&&pass>=r.expected.minPass&&fail===0;
  return {...planned,status:ok?'offline_pass':'failed',performed:true,counts:{pass,fail},failure:failure||(!ok?'No passing selected contract or test failures':null),evidence:{stdout,stderr},followups:r.followups};
}
export async function main(argv=process.argv.slice(2)) {
  const opts=parseArgs(argv);
  if(opts.help) { console.log('Usage: node tools/check/skill-smoke.mjs (--skill NAME | --all) (--plan | --check)\n--plan validates metadata/fixture catalog without execution, outputs or browser boot.\n--check serially runs selected bounded Node unit fixtures; browser/hardware remain unverified.');return 0; }
  const all=loadRecipes();const recipes=opts.all?all:all.filter(r=>r.skill===opts.skill);
  if(!recipes.length) throw new Error('Unknown canonical skill: '+opts.skill);
  const results=[];for(const r of recipes) results.push(opts.mode==='plan'?planRecipe(r):await checkRecipe(r));
  const ok=results.every(r=>r.status==='planned'||r.status==='offline_pass');
  console.log(JSON.stringify({schemaVersion:1,mode:opts.mode,scope:'bounded offline skill recipes',domainVerified:false,results},null,2));return ok?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(JSON.stringify({status:'failed',performed:false,error:error.message}));process.exitCode=2;});
