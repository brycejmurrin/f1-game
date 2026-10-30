// @doc Rebuildable SQLite projection of GitHub thread comments; bounded inbox queries and atomic refreshes.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { api, REPO } from '../ci/github-api.mjs';
import { parseMessage } from './message.mjs';

const APP_ID = 1095784521;
export const MAX_RESPONSE_BYTES = 16 * 1024;
export const positive = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
  return value;
};
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const fingerprint = e => createHash('sha256').update(JSON.stringify([
  e.schema, e.messageId, e.repo, e.thread.kind, e.thread.number, e.recipient,
  e.kind, e.sourceSha.toLowerCase(), e.expiresAt, e.replyTo, e.body,
])).digest('hex');

function normalizeComment(c, { repo, issue, kind }) {
  positive(c?.id, 'comment id');
  if (typeof c.body !== 'string' || !c.body.isWellFormed() || Buffer.byteLength(c.body) > 256 * 1024 ||
      typeof c.user?.login !== 'string' || !c.user.login || c.user.login.length > 100 || !timestamp(c.updated_at)) {
    throw new Error('GitHub returned an invalid or oversized comment');
  }
  const url = `https://github.com/${repo}/${kind === 'pull_request' ? 'pull' : 'issues'}/${issue}#issuecomment-${c.id}`;
  if (c.html_url !== url) throw new Error('GitHub comment source URL does not match thread');
  let envelope = null, parseError = null;
  try { envelope = parseMessage(c.body, { repo, issue, kind }); }
  catch (e) { parseError = e.message; }
  return { id: c.id, issue, body: c.body, actor: c.user.login, url,
    updatedAt: c.updated_at, envelope, parseError };
}

export class InboxStore {
  constructor(file, { repo = REPO } = {}) {
    if (repo !== REPO) throw new Error(`Inbox is scoped to ${REPO}`);
    this.repo = repo;
    this.db = new DatabaseSync(file);
    try {
      const app = this.db.prepare('PRAGMA application_id').get().application_id;
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      if (app !== APP_ID && (app !== 0 || tables.length)) throw new Error('Not an Apex inbox database');
      if (app === APP_ID && this.db.prepare('PRAGMA user_version').get().user_version !== 1) throw new Error('Unsupported inbox database version');
      this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;
        CREATE TABLE IF NOT EXISTS inbox_comments (
          id INTEGER PRIMARY KEY, issue INTEGER NOT NULL, body TEXT NOT NULL,
          actor TEXT NOT NULL, url TEXT NOT NULL, updated_at TEXT NOT NULL,
          envelope TEXT, message_id TEXT, recipient TEXT, fingerprint TEXT, parse_error TEXT
        );
        CREATE INDEX IF NOT EXISTS inbox_thread_id ON inbox_comments(issue,id);
        CREATE INDEX IF NOT EXISTS inbox_recipient ON inbox_comments(recipient,id);
        CREATE INDEX IF NOT EXISTS inbox_message_id ON inbox_comments(message_id);
        CREATE TABLE IF NOT EXISTS inbox_sync (
          issue INTEGER PRIMARY KEY, kind TEXT, last_success TEXT, last_error TEXT,
          generation INTEGER NOT NULL DEFAULT 0
        ); PRAGMA application_id=${APP_ID}; PRAGMA user_version=1;`);
    } catch (e) { this.db.close(); throw e; }
  }
  close() { this.db.close(); }
  readSnapshot(fn) {
    this.db.exec('BEGIN');
    try { const result=fn(); this.db.exec('COMMIT'); return result; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  status(issue, { now = Date.now(), staleMs = 10 * 60 * 1000 } = {}) {
    return this.readSnapshot(()=>this._status(issue,{now,staleMs}));
  }
  _status(issue, { now = Date.now(), staleMs = 10 * 60 * 1000 } = {}) {
    positive(issue, 'issue');
    const row = this.db.prepare('SELECT * FROM inbox_sync WHERE issue=?').get(issue);
    return { repo: this.repo, issue, generation: row?.generation ?? 0,
      lastSuccess: row?.last_success ?? null, lastError: row?.last_error ?? null,
      stale: !row?.last_success || !!row.last_error || now - Date.parse(row.last_success) > staleMs,
      cachedComments: this.db.prepare('SELECT count(*) AS n FROM inbox_comments WHERE issue=?').get(issue).n };
  }
  recordFailure(issue, error, expectedGeneration) {
    this.db.prepare(`INSERT INTO inbox_sync(issue,last_error) VALUES(?,?)
      ON CONFLICT(issue) DO UPDATE SET last_error=excluded.last_error
      WHERE inbox_sync.generation=?`).run(issue, String(error).slice(0,300),expectedGeneration);
  }
  replaceThread(issue, kind, comments, time, expectedGeneration) {
    const insert = this.db.prepare(`INSERT INTO inbox_comments
      (id,issue,body,actor,url,updated_at,envelope,message_id,recipient,fingerprint,parse_error)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current=this.db.prepare('SELECT generation FROM inbox_sync WHERE issue=?').get(issue)?.generation ?? 0;
      if (current!==expectedGeneration) throw new Error('Another sync refreshed this thread; cache preserved, retry');
      this.db.prepare('DELETE FROM inbox_comments WHERE issue=?').run(issue);
      for (const c of comments) {
        const e = c.envelope;
        insert.run(c.id,issue,c.body,c.actor,c.url,c.updatedAt,e ? JSON.stringify(e) : null,
          e?.messageId ?? null,e?.recipient ?? null,e ? fingerprint(e) : null,c.parseError);
      }
      this.db.prepare(`INSERT INTO inbox_sync(issue,kind,last_success,generation) VALUES(?,?,?,1)
        ON CONFLICT(issue) DO UPDATE SET kind=excluded.kind,last_success=excluded.last_success,
        last_error=NULL,generation=inbox_sync.generation+1`).run(issue,kind,time);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  list(issue, options={}) { return this.readSnapshot(()=>this._list(issue,options)); }
  _list(issue, { after = 0, generation, limit = 20, recipient, messagesOnly = false,
    maxBytes = MAX_RESPONSE_BYTES, now = Date.now() } = {}) {
    positive(issue, 'issue'); positive(limit, 'limit');
    if (limit > 100 || !Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(maxBytes) ||
        maxBytes < 2048 || maxBytes > MAX_RESPONSE_BYTES) throw new Error('Invalid inbox page bounds');
    if (recipient !== undefined && (typeof recipient !== 'string' || recipient.length > 140)) throw new Error('Invalid recipient');
    const status=this._status(issue,{now});
    if (after>0 && generation!==status.generation) throw new Error('Inbox generation changed or missing; restart list without --after');
    const rows = this.db.prepare(`SELECT c.*,
      (SELECT count(*) FROM inbox_comments d WHERE d.message_id=c.message_id) AS copies,
      (SELECT count(DISTINCT fingerprint) FROM inbox_comments d WHERE d.message_id=c.message_id) AS variants
      FROM inbox_comments c WHERE issue=? AND id>?
      ${recipient !== undefined ? 'AND recipient=?' : ''} ${messagesOnly ? 'AND envelope IS NOT NULL' : ''}
      ORDER BY id LIMIT ?`).all(...[issue,after,...(recipient !== undefined ? [recipient] : []),limit+1]);
    const page = { ok: true, source: 'local-cache', status, items: [], nextCursor: null };
    for (const row of rows) {
      if (page.items.length === limit) { page.nextCursor = page.items.at(-1).id; break; }
      const e = row.envelope ? JSON.parse(row.envelope) : null;
      const item = { id: row.id, url: row.url, actor: row.actor, updatedAt: row.updated_at,
        preview: Array.from(e?.body ?? row.body).slice(0,160).join(''),
        message: e ? { id: e.messageId, recipient: e.recipient, kind: e.kind,
          sourceSha: e.sourceSha, expired: Date.parse(e.expiresAt) <= now,
          copies: row.copies, conflict: row.variants > 1, identity: 'claimed' } : null,
        parseError: row.parse_error };
      // Reserve the cursor while checking bytes, so the final response cannot grow over its cap.
      const candidate = {...page,items:[...page.items,item],nextCursor:row.id};
      if (Buffer.byteLength(JSON.stringify(candidate)) > maxBytes) {
        if (!page.items.length) throw new Error('Inbox item exceeds page byte limit');
        page.nextCursor = page.items.at(-1).id; break;
      }
      page.items.push(item);
    }
    return page;
  }
  get(issue, id, options={}) { return this.readSnapshot(()=>this._get(issue,id,options)); }
  _get(issue, id, { afterCodePoint = 0, bodyVersion, maxBytes = MAX_RESPONSE_BYTES, now = Date.now() } = {}) {
    positive(issue,'issue'); positive(id,'comment id');
    if (!Number.isSafeInteger(afterCodePoint) || afterCodePoint < 0 || !Number.isSafeInteger(maxBytes) ||
        maxBytes < 2048 || maxBytes > MAX_RESPONSE_BYTES) throw new Error('Invalid body page bounds');
    const row = this.db.prepare('SELECT * FROM inbox_comments WHERE issue=? AND id=?').get(issue,id);
    if (!row) throw new Error('Comment is not in this thread cache; sync and list first');
    const version=createHash('sha256').update(row.body).digest('hex');
    if (afterCodePoint>0 && bodyVersion!==version) throw new Error('Comment body changed or version missing; restart get without --body-after');
    const points = Array.from(row.body);
    if (afterCodePoint > points.length) throw new Error('Body cursor exceeds comment length');
    const result = { ok:true,source:'local-cache',status:this._status(issue,{now}),
      id:row.id,url:row.url,actor:row.actor,updatedAt:row.updated_at,identity:'claimed',
      content:'',bodyVersion:version,nextBodyCursor:null,totalCodePoints:points.length };
    // Bound the serialized JSON bytes, including escapes and multibyte code points.
    let low=0, high=points.length-afterCodePoint;
    while (low<high) {
      const count=Math.ceil((low+high)/2), end=afterCodePoint+count;
      const candidate={...result,content:points.slice(afterCodePoint,end).join(''),nextBodyCursor:end<points.length?end:null};
      if (Buffer.byteLength(JSON.stringify(candidate))<=maxBytes) low=count; else high=count-1;
    }
    if (low===0 && afterCodePoint<points.length) throw new Error('Body page metadata exceeds byte limit');
    result.content=points.slice(afterCodePoint,afterCodePoint+low).join('');
    result.nextBodyCursor=afterCodePoint+low<points.length?afterCodePoint+low:null;
    return result;
  }
}

/** Complete, bounded refresh; incomplete/denied/changing sources never delete cached rows. GETs only. */
export function syncThread(store, issue, { request = api, maxPages = 10, pageSize = 100,
  now = () => new Date().toISOString() } = {}) {
  positive(issue,'issue'); positive(maxPages,'maxPages'); positive(pageSize,'pageSize');
  if (maxPages>100 || pageSize>100) throw new Error('Sync bounds exceed maximum');
  const expectedGeneration=store.status(issue).generation;
  let calls=0, receivedBytes=0;
  const get = route => {
    calls++;
    const response = request(route,{method:'GET'});
    if (response.error) throw new Error(`GitHub read failed: ${response.error}`);
    const size=Buffer.byteLength(JSON.stringify(response.json) ?? '');
    if (size>2*1024*1024) throw new Error('GitHub response exceeds 2 MiB page budget');
    receivedBytes+=size;
    return response.json;
  };
  try {
    const before=get(`issues/${issue}`);
    if (before?.number!==issue || !Number.isSafeInteger(before.comments) || !timestamp(before.updated_at)) throw new Error('Invalid GitHub thread metadata');
    const kind=before.pull_request?'pull_request':'issue', comments=[], seen=new Set();
    let complete=false;
    for (let page=1;page<=maxPages;page++) {
      const rows=get(`issues/${issue}/comments?per_page=${pageSize}&page=${page}`);
      if (!Array.isArray(rows) || rows.length>pageSize) throw new Error('Invalid GitHub comments page');
      for (const raw of rows) {
        const c=normalizeComment(raw,{repo:store.repo,issue,kind});
        if (seen.has(c.id)) throw new Error('Comment pagination changed during sync; retry');
        seen.add(c.id); comments.push(c);
      }
      if (rows.length<pageSize) { complete=true; break; }
    }
    if (!complete) throw new Error('Sync page limit reached; cache preserved, increase --max-pages');
    const after=get(`issues/${issue}`);
    if (before.updated_at!==after?.updated_at || before.comments!==after.comments || comments.length!==after.comments) throw new Error('Thread changed during sync; cache preserved, retry');
    store.replaceThread(issue,kind,comments,now(),expectedGeneration);
    return {ok:true,apiCalls:calls,receivedBytes,indexed:comments.length,
      validMessages:comments.filter(c=>c.envelope).length,invalidMessages:comments.filter(c=>c.parseError).length,
      status:store.status(issue)};
  } catch (e) { store.recordFailure(issue,e.message,expectedGeneration); throw e; }
}
