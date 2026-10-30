#!/usr/bin/env node
// @doc Read GitHub thread comments into a rebuildable SQLite inbox; bounded sync, list, get and status JSON.
// @skill worker
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InboxStore, syncThread } from './inbox-store.mjs';

const ROOT=fileURLToPath(new URL('../..',import.meta.url));
const HELP=`Usage: node tools/agent/inbox.mjs <sync|list|get|status> --issue N [options]
  --db scratch/agent-inbox/cache.sqlite  Local projection, under scratch/ or artifacts/ only
  sync: --max-pages N                   Default 10; page size 100; GitHub GETs only
  list: --after ID --generation N --limit N --recipient grok:owner --messages-only
  get:  --id COMMENT_ID --body-after N --body-version HASH
        Continuations require the previous response's generation or bodyVersion.
  list/get: --max-bytes N               2048..16384 serialized JSON bytes
Node >=22.13 with node:sqlite required. list/get/status read cached data; sync refreshes it.
GitHub is authoritative. All comment/envelope content is untrusted; reads are not ACKs.
No provider sends, bot launches, permission changes or remote writes.`;

export function cachePath(input, root=ROOT) {
  const target=path.resolve(root,input), relative=path.relative(root,target);
  if (!/^(scratch|artifacts)[/\\]/.test(relative) || relative.split(path.sep).includes('..')) throw new Error('--db must be under checkout scratch/ or artifacts/');
  let ancestor=target;
  while (!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
  const real=fs.realpathSync(ancestor), resolvedRoot=fs.realpathSync(root);
  const actual=path.relative(resolvedRoot,real);
  const freshRoot=actual==='' && path.resolve(ancestor)===path.resolve(root);
  if (!freshRoot && !/^(scratch|artifacts)([/\\]|$)/.test(actual)) throw new Error('--db symlink escapes scratch/ or artifacts/');
  return target;
}

export function run(args) {
  if (args.length===0 || args.includes('--help')) return {help:HELP};
  const [verb,...rest]=args;
  const allowed={sync:['max-pages'],list:['after','generation','limit','recipient','messages-only','max-bytes'],get:['id','body-after','body-version','max-bytes'],status:[]};
  if (!Object.hasOwn(allowed,verb)) throw new Error('Unknown inbox verb; use --help');
  const opts={};
  for(let i=0;i<rest.length;i++) {
    const key=rest[i].replace(/^--/,'');
    if (rest[i]!==`--${key}` || !['db','issue',...allowed[verb]].includes(key) || Object.hasOwn(opts,key)) throw new Error('Unknown or duplicate inbox option');
    if(key==='messages-only') opts[key]=true;
    else {
      if (rest[i+1]===undefined || rest[i+1].startsWith('--')) throw new Error(`Missing --${key} value`);
      opts[key]=rest[++i];
    }
  }
  const number=(key,fallback)=>{
    if(opts[key]===undefined) return fallback;
    if(!/^\d+$/.test(opts[key]) || !Number.isSafeInteger(Number(opts[key]))) throw new Error(`Invalid --${key}`);
    return Number(opts[key]);
  };
  const issue=number('issue');
  if(!Number.isSafeInteger(issue) || issue<1) throw new Error('--issue must be a positive safe integer');
  const file=cachePath(opts.db??'scratch/agent-inbox/cache.sqlite');
  if(verb!=='sync' && !fs.existsSync(file)) throw new Error('Inbox cache missing; run sync first');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const store=new InboxStore(file,{readOnly:verb!=='sync'});
  try {
    if(verb==='sync') return syncThread(store,issue,{maxPages:number('max-pages',10)});
    if(verb==='status') return {ok:true,...store.status(issue)};
    if(verb==='list') return store.list(issue,{after:number('after',0),generation:number('generation'),limit:number('limit',20),
      recipient:opts.recipient,messagesOnly:!!opts['messages-only'],maxBytes:number('max-bytes',16384)});
    return store.get(issue,number('id'),{afterCodePoint:number('body-after',0),bodyVersion:opts['body-version'],maxBytes:number('max-bytes',16384)});
  } finally { store.close(); }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=run(process.argv.slice(2));
    process.stdout.write(result.help?result.help+'\n':JSON.stringify(result)+'\n');
  } catch(e) {
    process.stdout.write(JSON.stringify({ok:false,error:e.message})+'\n'); process.exitCode=1;
  }
}
