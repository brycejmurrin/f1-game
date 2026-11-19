
const TTL_MS = 120000;

const SLOTS = new Set(["offer", "answer"]);

const ENVELOPE_TAG = "v2.";
const MAX_SEALED_PAYLOAD = 12288;
const MAX_BODY = MAX_SEALED_PAYLOAD + 512;

const RATE_WINDOW_MS = 60000;
const WRITE_LIMIT = 20;
const READ_LIMIT = 180;
const RATE_BUCKET_CAP = 4096;
const rateBuckets = new Map();

function rateAllowed(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const kind = request.method === "GET" ? "read" : "write";
  const limit = kind === "read" ? READ_LIMIT : WRITE_LIMIT;
  const key = ip + ":" + kind;
  const now = Date.now();
  let rec = rateBuckets.get(key);
  if (!rec || now - rec.start >= RATE_WINDOW_MS) rec = { start: now, n: 0 };
  rec.n++;
  rateBuckets.delete(key);
  rateBuckets.set(key, rec);
  if (rateBuckets.size > RATE_BUCKET_CAP) {
    while (rateBuckets.size > RATE_BUCKET_CAP) {
      const oldest = rateBuckets.keys().next().value;
      if (oldest == null) break;
      rateBuckets.delete(oldest);
    }
  }
  return rec.n <= limit;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-expose-headers": "x-apex-rendezvous",
  "x-apex-rendezvous": "3",
  "access-control-max-age": "86400",
};

const json = (obj, status = 200, extraHeaders = null) => new Response(obj == null ? "" : JSON.stringify(obj), {
  status,
  headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store", ...(extraHeaders || {}) },
});

async function boundedBody(request) {
  const rawLength = request.headers.get("content-length");
  if (rawLength != null && /^\d+$/.test(rawLength) && Number(rawLength) > MAX_BODY) {
    return { tooBig: true, text: null };
  }
  if (!request.body) return { tooBig: false, text: "" };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += bytes.byteLength;
      if (total > MAX_BODY) {
        try { await reader.cancel("body too large"); } catch (_) {}
        return { tooBig: true, text: null };
      }
      chunks.push(bytes);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  const joined = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) { joined.set(chunk, off); off += chunk.byteLength; }
  return { tooBig: false, text: new TextDecoder().decode(joined) };
}

export class Room {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const slot = url.searchParams.get("slot");
    if (!SLOTS.has(slot)) return json({ error: "bad_slot" }, 400);

    if (request.method === "GET") {
      const rec = await this.state.storage.get(slot);
      if (!rec || Date.now() >= rec.expires) return json({ error: "not_found" }, 404);
      return json({ payload: rec.payload });
    }

    if (request.method === "POST") {
      const raw = await boundedBody(request);
      if (raw.tooBig) return json({ error: "too_big" }, 413);
      let body = null;
      try { body = JSON.parse(raw.text); } catch (_) {}
      const payload = body && body.payload;
      const owner = body && body.owner;
      if (typeof payload !== "string") return json({ error: "bad_payload" }, 400);
      if (new TextEncoder().encode(payload).byteLength > MAX_SEALED_PAYLOAD) return json({ error: "too_big" }, 413);
      const encoded = payload.slice(ENVELOPE_TAG.length);
      if (!payload.startsWith(ENVELOPE_TAG) || encoded.length < 59 ||
          encoded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
        return json({ error: "bad_payload" }, 400);
      }
      if (owner != null && (typeof owner !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(owner))) {
        return json({ error: "bad_owner" }, 400);
      }

      return this.state.storage.transaction(async () => {
        const storage = this.state.storage;
        const existing = await storage.get(slot);
        if (slot === "offer" && existing && Date.now() < existing.expires) {
          const sameOwner = owner && existing.owner && owner === existing.owner;
          if (!sameOwner) return json({ error: "taken" }, 409);
        }
        await storage.put(slot, { payload, owner: owner || null, expires: Date.now() + TTL_MS });
        let next = Infinity;
        for (const name of SLOTS) {
          const rec = await storage.get(name);
          if (rec) next = Math.min(next, rec.expires);
        }
        await storage.setAlarm(next);
        return json({ ok: true });
      });
    }

    return json({ error: "method" }, 405);
  }

  async alarm() {
    const storage = this.state.storage;
    const empty = await storage.transaction(async () => {
      let next = Infinity;
      const now = Date.now();
      for (const slot of SLOTS) {
        const rec = await storage.get(slot);
        if (!rec) continue;
        if (rec.expires <= now) await storage.delete(slot);
        else next = Math.min(next, rec.expires);
      }
      if (Number.isFinite(next)) { await storage.setAlarm(next); return false; }
      await storage.deleteAlarm();
      return true;
    });
    if (!empty) return;
    await this.state.blockConcurrencyWhile(async () => {
      for (const slot of SLOTS) if (await storage.get(slot)) return;
      await storage.deleteAll();
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method" }, 405, { allow: "GET, POST, OPTIONS" });
    }

    if (!rateAllowed(request)) {
      return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
    }

    const url = new URL(request.url);
    if (/^\/r\//.test(url.pathname)) return json({ error: "upgrade_required" }, 426);
    const m = url.pathname.match(/^\/v3\/r\/([0-9a-f]{64})\/(offer|answer)$/);
    if (!m) return json({ error: "not_found" }, 404);
    const [, roomId, slot] = m;

    const id = env.ROOM.idFromName("v3:" + roomId);
    const stub = env.ROOM.get(id);
    const inner = new URL(request.url);
    inner.searchParams.set("slot", slot);
    return stub.fetch(new Request(inner, request));
  },
};
