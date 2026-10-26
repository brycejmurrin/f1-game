/*
 * The rendezvous relay — a Cloudflare Worker + one Durable Object per opaque room id.
 *
 * This is the ONLY server anywhere in Apex 26, it is optional, and its entire
 * job is to hold two short strings for a couple of minutes so two browsers can
 * find each other. Once WebRTC connects, every byte of gameplay goes directly
 * between the players and this never sees another packet.
 *
 * WHY A DURABLE OBJECT rather than a KV store or a plain Worker: "exactly two
 * people meet using one token" needs ONE canonical place. A Durable Object is
 * one instance per id by construction, so there is no window where the host
 * writes to one region and the guest reads from another and finds nothing.
 * Regional edge runtimes need a cross-region broadcast to paper over exactly
 * that; this does not.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *   - No accounts, usernames, or directory. A code is disposable; there is
 *     nothing to claim, squat, impersonate or recover.
 *   - No logging of payloads or addresses. The payload is an already-compressed
 *     SDP the two peers exchange anyway, and it is dropped on expiry.
 *   - No serving beyond the per-slot TTL. An expiry alarm cleans up stored slots.
 *
 * DEPLOY:
 *   cd worker && npx wrangler deploy
 * then in the game (devtools console, once):
 *   localStorage.setItem("apex26.rendezvous", "https://<your-worker>.workers.dev")
 * With that key unset the public Nostr relay pool does the rendezvous instead
 * and the game is unchanged.
 */

// Two minutes is chosen by the thing it has to outlive: a human sharing
// a token with a friend and that friend pasting it. It is also short enough
// that abandoned rooms do not accumulate. Token entropy resists guessing.
const TTL_MS = 120000;

// A slot is one side's blob. Named rather than positional so a mismatched
// client gets a 404 instead of quietly reading the wrong half.
const SLOTS = new Set(["offer", "answer"]);

// Bounded because this is an unauthenticated endpoint on the public internet:
// the real payload is ~250 bytes of SDP, sealed browser-side (AES-GCM, a
// 16-byte salt, a 12-byte IV, a 16-byte tag, base64 at 4/3), and 12 KB is
// generous for a client that packs its SDP badly while still making the
// object useless as bulk storage. Check the v2 base64url envelope structure;
// only the clients can authenticate/decrypt it (js/net/rendezvous.js sealPrivate).
const ENVELOPE_TAG = "v2.";
const MAX_SEALED_PAYLOAD = 12288;
// JSON adds a few bytes around `payload` and the stable owner capability.
const MAX_BODY = MAX_SEALED_PAYLOAD + 512;

// Defence in depth before a request reaches a Durable Object. Cloudflare may
// run several isolates, so this is not a substitute for an account-level WAF
// rule, but it prevents one browser/origin from cheaply minting unbounded room
// objects through a single hot isolate. Real clients write at most twice and
// poll about 50 times/minute; these ceilings leave ample retry/NAT headroom.
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
  // Reinsert so Map order is recency order. That makes the hard-cap eviction
  // below deterministic and preserves buckets that are still actively used.
  rateBuckets.delete(key);
  rateBuckets.set(key, rec);
  if (rateBuckets.size > RATE_BUCKET_CAP) {
    // A cap that only deletes expired entries is not a cap: a burst of fresh
    // IPv6 addresses can grow the map forever and make every cleanup O(n).
    // Drop least-recently-used buckets until the invariant is restored.
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
      // Expiry is checked on READ as well as swept on a timer: an object that
      // has been idle since before its alarm fired must not serve a stale
      // offer to someone who typed a recycled code.
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
      // salt(16) + IV(12) + GCM tag(16), encoded without base64 padding.
      const encoded = payload.slice(ENVELOPE_TAG.length);
      if (!payload.startsWith(ENVELOPE_TAG) || encoded.length < 59 ||
          encoded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
        return json({ error: "bad_payload" }, 400);
      }
      if (owner != null && (typeof owner !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(owner))) {
        return json({ error: "bad_owner" }, 400);
      }

      // SQLite storage operations in this closure participate in the transaction:
      // https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transaction
      // Keep the slot update and earliest-expiry alarm atomic with alarm cleanup.
      return this.state.storage.transaction(async () => {
        const storage = this.state.storage;
        const existing = await storage.get(slot);
        // A retry is recognized by the stable owner capability, not ciphertext:
        // each seal uses a fresh salt and IV.
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

  // A later answer must retain its own TTL, without retaining an expired offer.
  // Alarm delivery may be delayed by the platform; reads still enforce expiry.
  async alarm() {
    await this.state.storage.transaction(async () => {
      const storage = this.state.storage;
      let next = Infinity;
      const now = Date.now();
      for (const slot of SLOTS) {
        const rec = await storage.get(slot);
        if (!rec) continue;
        if (rec.expires <= now) await storage.delete(slot);
        else next = Math.min(next, rec.expires);
      }
      if (Number.isFinite(next)) await storage.setAlarm(next);
      else await storage.deleteAlarm();
    });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    // Refuse every other method HERE, before the rate limiter is consulted
    // and before a Durable Object is named: a PUT/DELETE/HEAD used to skip
    // rateAllowed() (which only keys GET/POST) and still allocate a billable
    // object just to be told 405 inside it.
    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method" }, 405, { allow: "GET, POST, OPTIONS" });
    }

    const url = new URL(request.url);
    // Legacy routes reveal the encryption secret to the operator. Never serve
    // or create them, even for a stale client. The new route contains only a
    // domain-separated id derived from a random 32-character private token.
    if (/^\/r\//.test(url.pathname)) return json({ error: "upgrade_required" }, 426);
    const m = url.pathname.match(/^\/v3\/r\/([0-9a-f]{64})\/(offer|answer)$/);
    if (!m) return json({ error: "not_found" }, 404);
    const [, roomId, slot] = m;
    if (!rateAllowed(request)) {
      return json({ error: "rate_limited" }, 429, { "retry-after": "60" });
    }

    // Prefix the namespace too: old six-character rooms are never reused.
    const id = env.ROOM.idFromName("v3:" + roomId);
    const stub = env.ROOM.get(id);
    const inner = new URL(request.url);
    inner.searchParams.set("slot", slot);
    return stub.fetch(new Request(inner, request));
  },
};
