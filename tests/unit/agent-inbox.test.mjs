import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { InboxStore, syncThread } from '../../tools/agent/inbox-store.mjs';
import { cachePath, run } from '../../tools/agent/inbox.mjs';
import { formatMessage } from '../../tools/agent/message.mjs';

const ROOT=fileURLToPath(new URL('../..',import.meta.url));
const REPO='brycejmurrin/f1-game', TIME='2026-10-30T12:00:00Z';
const comment=(id,body='ordinary comment',issue=42)=>({id,body,user:{login:'fixture-user'},updated_at:TIME,
  html_url:`https://github.com/${REPO}/issues/${issue}#issuecomment-${id}`});
const envelope=(body='bounded work',messageId='task-1')=>({schema:'apex.message.v1',messageId,repo:REPO,
  thread:{kind:'issue',number:42},recipient:'grok:owner',kind:'handoff',sourceSha:'a'.repeat(40),
  expiresAt:'2026-11-01T12:00:00Z',replyTo:null,body});
function source(rows,{failPage,metadataAfter,pageTransform}={}) {
  const calls=[]; let meta=0;
  const request=(route,opts)=>{
    calls.push(route); assert.deepEqual(opts,{method:'GET',anonymous:true});
    if(route==='issues/42') return {json:++meta===2 && metadataAfter ? metadataAfter : {number:42,comments:rows.length,updated_at:TIME}};
    const match=route.match(/^issues\/42\/comments\?per_page=(\d+)&page=(\d+)$/);
    assert.ok(match,'only repository-relative thread reads');
    const size=Number(match[1]), page=Number(match[2]);
    if(page===failPage) return {error:'HTTP 403'};
    return {json:pageTransform ? pageTransform(page) : rows.slice((page-1)*size,page*size)};
  };
  return {request,calls};
}
function usingStore(t,file=':memory:') { const store=new InboxStore(file); t.after(()=>store.close()); return store; }
function scratch(t) {
  fs.mkdirSync(path.join(ROOT,'scratch'),{recursive:true});
  const dir=fs.mkdtempSync(path.join(ROOT,'scratch','agent-inbox-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true})); return dir;
}
const refresh=(store,rows,opts={})=>syncThread(store,42,{...source(rows),now:()=>TIME,...opts});

test('cold inbox sync paginates GitHub and warm list makes no API request',t=>{
  const store=usingStore(t), api=source([comment(1),comment(2,'second'),comment(3,'third')]);
  const result=syncThread(store,42,{...api,pageSize:2,now:()=>TIME});
  assert.equal(result.indexed,3); assert.equal(result.apiCalls,4);
  assert.equal(api.calls.length,4);
  assert.deepEqual(store.list(42,{now:Date.parse(TIME)}).items.map(x=>x.id),[1,2,3]);
  assert.equal(api.calls.length,4,'list queries local SQLite only');
  assert.equal(store.status(42,{now:Date.parse(TIME)}).stale,false);
  assert.equal(store.status(42,{now:Date.parse(TIME)+600001}).stale,true);
});

test('complete refresh reconciles comment edits, deletions and empty source',t=>{
  const store=usingStore(t); refresh(store,[comment(1),comment(2)]);
  refresh(store,[comment(2,'edited'),comment(3)]);
  assert.deepEqual(store.list(42).items.map(x=>[x.id,x.preview]),[[2,'edited'],[3,'ordinary comment']]);
  assert.throws(()=>store.get(42,1),/not in this thread/);
  assert.equal(store.status(42).generation,2);
  refresh(store,[]); assert.equal(store.list(42).items.length,0);
  assert.equal(store.status(42).generation,3);
});

test('denied, bounded and changing fetches preserve last good snapshot and expose failure',t=>{
  const store=usingStore(t); refresh(store,[comment(10,'must survive')]);
  const scenarios=[
    {...source([comment(1),comment(2),comment(3)],{failPage:2}),pageSize:2},
    {...source([comment(1),comment(2)]),pageSize:2,maxPages:1},
    {...source([comment(1)],{metadataAfter:{number:42,comments:2,updated_at:TIME}})},
    {...source([comment(1)],{metadataAfter:{number:42,comments:1,updated_at:'2026-10-30T12:00:01Z'}})},
    {...source([comment(1),comment(2)],{pageTransform:page=>page===1?[comment(1),comment(2)]:[comment(2)]}),pageSize:2},
    {...source([{...comment(1),html_url:'https://attacker.example/source'}])},
    {...source([]),request:()=>({error:'HTTP 404'})},
  ];
  for(const opts of scenarios) {
    assert.throws(()=>syncThread(store,42,opts));
    assert.equal(store.get(42,10).content,'must survive');
    const status=store.status(42);
    assert.equal(status.generation,1); assert.ok(status.lastError); assert.equal(status.stale,true);
  }
  refresh(store,[comment(10)]); assert.equal(store.status(42).lastError,null);
});

test('malformed/scope-forged envelopes stay visible as diagnostics and never become messages',t=>{
  const store=usingStore(t);
  const wrong={...envelope(),thread:{kind:'issue',number:999}};
  const result=refresh(store,[comment(1,'```apex-message\n{bad}\n```'),comment(2,formatMessage(wrong)),comment(3,formatMessage(envelope()))]);
  assert.equal(result.validMessages,1); assert.equal(result.invalidMessages,2);
  const rows=store.list(42,{now:Date.parse('2026-11-02T00:00:00Z')}).items;
  assert.match(rows[0].parseError,/malformed/); assert.match(rows[1].parseError,/scope/);
  assert.deepEqual(store.list(42,{recipient:'grok:owner'}).items.map(x=>x.id),[3]);
  assert.equal(rows[2].message.identity,'claimed');
  assert.equal(rows[2].message.expired,true,'expiry is reported, not delivery authority');
  assert.equal(store.list(42,{messagesOnly:true}).items.length,1);
});

test('PR source metadata binds envelopes to pull_request rather than issue',t=>{
  const store=usingStore(t), e={...envelope(),thread:{kind:'pull_request',number:42}};
  const row={...comment(1,formatMessage(e)),html_url:`https://github.com/${REPO}/pull/42#issuecomment-1`};
  const api=source([row]);
  const request=(route,opts)=>{
    const result=api.request(route,opts);
    if(route==='issues/42') result.json.pull_request={url:'https://api.github.com/fixture'};
    return result;
  };
  assert.equal(syncThread(store,42,{request}).validMessages,1);
  assert.equal(store.list(42,{messagesOnly:true}).items[0].id,1);
});

test('retry copies and changed envelopes distinguish duplicates from conflicts',t=>{
  const store=usingStore(t), first=envelope();
  const reversed=Object.fromEntries(Object.entries(first).reverse());
  refresh(store,[comment(1,formatMessage(first)),comment(2,formatMessage(reversed))]);
  let rows=store.list(42).items;
  assert.equal(rows[0].message.copies,2); assert.equal(rows[0].message.conflict,false);
  refresh(store,[comment(1,formatMessage(first)),comment(2,formatMessage(envelope('different instruction')))]);
  rows=store.list(42).items;
  assert.ok(rows.every(x=>x.message.conflict));
});

test('list byte cap, cursor and generation preserve every row without silent truncation',t=>{
  const store=usingStore(t);
  refresh(store,Array.from({length:30},(_,i)=>comment(i+1,'🧭"\n'.repeat(150))));
  let after=0, generation, ids=[];
  do {
    const page=store.list(42,{after,generation,limit:20,maxBytes:2048});
    assert.ok(Buffer.byteLength(JSON.stringify(page))<=2048);
    assert.ok(page.items.length>0);
    ids.push(...page.items.map(x=>x.id)); generation=page.status.generation; after=page.nextCursor;
  } while(after!==null);
  assert.deepEqual(ids,Array.from({length:30},(_,i)=>i+1));
  refresh(store,[comment(1)]);
  assert.throws(()=>store.list(42,{after:1,generation}),/generation/);
  assert.throws(()=>store.list(42,{limit:101}),/bounds/);
  assert.throws(()=>store.list(42,{maxBytes:20000}),/bounds/);
});

test('get pages preserve exact Unicode text and reject continuation after an edit',t=>{
  const store=usingStore(t), body='🧭"\n'.repeat(3000);
  refresh(store,[comment(1,body)]);
  let afterCodePoint=0, bodyVersion, joined='';
  do {
    const part=store.get(42,1,{afterCodePoint,bodyVersion,maxBytes:2048});
    assert.ok(Buffer.byteLength(JSON.stringify(part))<=2048);
    joined+=part.content; bodyVersion=part.bodyVersion; afterCodePoint=part.nextBodyCursor;
  } while(afterCodePoint!==null);
  assert.equal(joined,body);
  refresh(store,[comment(1,'edited')]);
  assert.throws(()=>store.get(42,1,{afterCodePoint:1,bodyVersion}),/body changed/);
  assert.throws(()=>store.get(43,1),/not in this thread/);
});

test('SQLite cache survives reopen and transaction rollback preserves other threads',t=>{
  const file=path.join(scratch(t),'cache.sqlite');
  let store=new InboxStore(file); refresh(store,[comment(1)]); store.close();
  store=new InboxStore(file); t.after(()=>store.close());
  assert.equal(store.get(42,1).content,'ordinary comment');
  assert.throws(()=>store.replaceThread(99,'issue',[{id:1,issue:99,body:'conflict',actor:'x',url:'x',updatedAt:TIME,envelope:null,parseError:null}],TIME,0));
  assert.equal(store.get(42,1).content,'ordinary comment');
  assert.equal(store.status(99).generation,0);
});

test('cache read handles cannot initialize or modify SQLite state',t=>{
  const root=scratch(t), file=path.join(root,'read-only.sqlite');
  let store=new InboxStore(file); refresh(store,[comment(1,'read fixture')]); store.close();
  store=new InboxStore(file,{readOnly:true}); t.after(()=>store.close());
  assert.equal(store.get(42,1).content,'read fixture');
  assert.throws(()=>store.replaceThread(42,'issue',[],TIME,1),/readonly|read-only/i);
  assert.equal(store.get(42,1).content,'read fixture');
  const empty=path.join(root,'empty.sqlite'); fs.writeFileSync(empty,'');
  assert.throws(()=>new InboxStore(empty,{readOnly:true}),/not initialized/);
  assert.equal(fs.statSync(empty).size,0);
});

test('cache path supports a fresh checkout and refuses traversal, links and unrelated databases',t=>{
  const root=scratch(t), target=path.join(root,'scratch','new','cache.sqlite');
  assert.equal(cachePath('scratch/new/cache.sqlite',root),target);
  assert.throws(()=>cachePath('AGENTS.md',root),/scratch/);
  assert.throws(()=>cachePath('../outside.sqlite',root),/scratch/);
  fs.symlinkSync(ROOT,path.join(root,'scratch'));
  assert.throws(()=>cachePath('scratch/escape.sqlite',root),/symlink/);
  const file=path.join(root,'foreign.sqlite');
  const db=new DatabaseSync(file); db.exec('CREATE TABLE valuable(value TEXT)'); db.close();
  assert.throws(()=>new InboxStore(file),/Not an Apex/);
});

test('cache path refuses a scratch symlink back to the checkout itself',t=>{
  const root=scratch(t); fs.symlinkSync(root,path.join(root,'scratch'));
  assert.throws(()=>cachePath('scratch/package.json',root),/symlink/);
});

test('slow refresh cannot overwrite a newer process snapshot or its success state',t=>{
  const file=path.join(scratch(t),'concurrent.sqlite');
  const first=usingStore(t,file), second=usingStore(t,file);
  refresh(first,[comment(1,'initial')]);
  const older=source([comment(1,'old snapshot')]); let advanced=false;
  const request=(...args)=>{
    if(!advanced) { advanced=true; refresh(second,[comment(1,'newer snapshot')]); }
    return older.request(...args);
  };
  assert.throws(()=>syncThread(first,42,{request}),/Another sync/);
  assert.equal(first.get(42,1).content,'newer snapshot');
  assert.equal(first.status(42).generation,2);
  assert.equal(first.status(42).lastError,null,'older failure cannot mark a newer successful snapshot stale');
});

test('CLI exposes a bounded read-only surface and structured nonzero errors',()=>{
  assert.match(run(['--help']).help,/No provider sends/);
  for(const args of [['send'],['list','--issue','42','--recipient'],['list','--issue','42','--issue','43'],['list','--issue','42','--unknown','x']]) assert.throws(()=>run(args));
  const result=spawnSync(process.execPath,['tools/agent/inbox.mjs','send'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(result.status,1);
  assert.equal(JSON.parse(result.stdout).ok,false);
});
