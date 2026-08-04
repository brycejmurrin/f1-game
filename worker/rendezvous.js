/*
 * The rendezvous relay — a Cloudflare Worker + one Durable Object per room code.
 *
 * This is the ONLY server anywhere in Apex 26, it is optional, and its entire
 * job is to hold two short strings for a couple of minutes so two browsers can
 * find each other. Once WebRTC connects, every byte of gameplay goes directly
 * between the players and this never sees another packet.
 *
 * WHY A DURABLE OBJECT rather than a KV store or a plain Worker: "exactly two
 * people meet at code APEX42" needs ONE canonical place. A Durable Object is
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
 *   - No persistence beyond the TTL. Nothing survives to be leaked or subpoenaed.
 *
 * DEPLOY:
 *   cd worker && npx wrangler deploy
 * then in the game (devtools console, once):
 *   localStorage.setItem("apex26.rendezvous", "https://<your-worker>.workers.dev")
 * With that key unset the feature hides itself and the game is unchanged.
 */

// Two minutes is chosen by the thing it has to outlive: a human reading six
// characters to a friend and that friend typing them. It is also short enough
// that a code cannot be usefully brute-forced and that nothing accumulates.
const TTL_MS = 120000;

// A slot is one side's blob. Named rather than positional so a mismatched
// client gets a 404 instead of quietly reading the wrong half.
const SLOTS = new Set(["offer", "answer"]);

// Bounded because this is an unauthenticated endpoint on the public internet:
// the real payload is ~250 bytes and 8 KB is generous for a client that packs
// its SDP badly, while still making the object useless as free storage.
const MAX_PAYLOAD = 8192;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

const json = (obj, status = 200) => new Response(obj == null ? "" : JSON.stringify(obj), {
  status,
  headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
});

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
      if (!rec || Date.now() > rec.expires) return json({ error: "not_found" }, 404);
      return json({ payload: rec.payload });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      const payload = body && body.payload;
      if (typeof payload !== "string" || !payload) return json({ error: "bad_payload" }, 400);
      if (payload.length > MAX_PAYLOAD) return json({ error: "too_big" }, 413);

      const existing = await this.state.storage.get(slot);
      // Refusing to overwrite a LIVE offer is what stops two hosts silently
      // sharing a code — the second one is told to make a new one rather than
      // stealing the first one's guest.
      if (slot === "offer" && existing && Date.now() < existing.expires && existing.payload !== payload) {
        return json({ error: "taken" }, 409);
      }
      await this.state.storage.put(slot, { payload, expires: Date.now() + TTL_MS });
      // One alarm for the whole object: it wipes everything, so a room cannot
      // outlive its TTL just because one slot was written later than the other.
      await this.state.storage.setAlarm(Date.now() + TTL_MS + 1000);
      return json({ ok: true });
    }

    return json({ error: "method" }, 405);
  }

  // Nothing is meant to survive. Deleting rather than expiring in place is what
  // makes "no data retained" true instead of aspirational.
  async alarm() {
    await this.state.storage.deleteAll();
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    // /r/<code>/<slot>
    const m = url.pathname.match(/^\/r\/([0-9A-Z]{4,12})\/(offer|answer)$/);
    if (!m) return json({ error: "not_found" }, 404);
    const [, code, slot] = m;

    // idFromName, not idFromString: the code IS the room, and deriving the id
    // from it is what guarantees both players reach the same object.
    const id = env.ROOM.idFromName(code);
    const stub = env.ROOM.get(id);
    const inner = new URL(request.url);
    inner.searchParams.set("slot", slot);
    return stub.fetch(new Request(inner, request));
  },
};
