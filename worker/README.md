# The rendezvous relay (optional)

This optional Worker holds two encrypted signalling envelopes for two minutes.
Private rooms use a **32-character token** generated in the browser with
cryptographic randomness (>158 bits). Players copy/share that token privately;
it never appears in a Worker request. The client derives a separate opaque room
id and an AES-GCM encryption key using distinct HKDF info strings. The Worker
sees `/v3/r/<64-hex-id>/<offer|answer>` and `v2.` ciphertext, so it cannot recover
the token or decrypt/forge signalling contents from its HTTP traffic.

A relay can still drop traffic or replay an existing same-slot envelope; AES-GCM
authenticates contents, not freshness. Slot AAD prevents offer-as-answer replay.
The ordinary public Nostr room-code path remains six characters and is a
separate protocol with a smaller shared secret.

Once WebRTC connects, every byte of gameplay goes **directly** between the two
players. The relay never sees another packet.

## Why it exists

The invite link and the QR code need no infrastructure and never break — they
are the primary way in, and they stay. But they need the two players to move a
code between them. A private room needs only one shared token:

```
HOST                        rendezvous                       GUEST
POST offer  ─────────────▶  [held, 2 min]
                            ◀──────── GET offer ──────────   pastes the token
                            ◀──────── POST answer ────────
GET answer  ◀─────────────
...direct P2P from here...
```

It is **not** a username system. A token is disposable: nothing is stored past
the TTL and no personal data is retained. There is no account to lose and
nothing to moderate. A random, unguessable owner capability does let the same
host safely retry or replace its offer without letting another client overwrite
an active room.

## Deploy

```sh
cd worker
npx wrangler deploy
```

Room codes already work with nothing deployed: `DEFAULT_URL` in
`js/net/rendezvous.js` is empty **on purpose**, and the public-broker backend
handles the rendezvous. To make your own relay the default for every player,
paste the resulting `https://apex26-rendezvous.<you>.workers.dev` URL into
`DEFAULT_URL`; the deploy stamps asset versions automatically.

For a staging worker without editing the file, set it per-device instead:

```js
localStorage.setItem("apex26.rendezvous", "https://<worker>.workers.dev")
```

## Protocol 3 rollout

Deploy this Worker, reload both players to the updated game, and mint a new
private room token. Both devices must use the same Worker URL. The game offers
COPY/SHARE and a paste field for the longer token. Phone-controller QR links
include the relay URL and token in their fragment so another device can pair
without preconfiguring its local storage. CONNECT uses that relay only for the
controller document; relay URLs must be HTTPS (loopback HTTP is allowed for
development), with no credentials, query or fragment. Manual invite links and
QR codes are also available without a relay.

Old six-character private rooms are intentionally incompatible: `/r/...` returns
426 before a Durable Object is allocated. Never add a compatibility route or
send the token as a path/query/body field. The old path revealed the encryption
secret to the operator; hashing a six-character secret alone would still enable
offline guessing. Current clients require the CORS-exposed
`X-Apex-Rendezvous: 3` header and explicitly ask players to update an old Worker
or use the manual invite. They never downgrade to the old path or plaintext.
The `v2.` envelope name describes the ciphertext layout, not the HTTP version.

API references: [WebCrypto randomness](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues),
[HKDF derivation and info](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey).

## Cost

Checked against Cloudflare's Durable Objects pricing page on 2026-11-10
(developers.cloudflare.com/durable-objects/platform/pricing). Durable Objects
have been on the Workers **Free plan** since April 2025; the Free plan can only
use SQLite-backed classes, which is why `wrangler.toml` uses
`new_sqlite_classes`. Free-plan daily limits (reset 00:00 UTC):

| Limit | Free plan | What one handoff uses |
| --- | --- | --- |
| Durable Object requests (HTTP + alarm invocations) | 100,000 / day | ~2 POSTs, polls at ~50/min while waiting, 1–2 alarms |
| Duration | 13,000 GB-s / day (billed at 128 MB per active object) | seconds of activity per room |
| SQLite rows read | 5 million / day | a few per request |
| SQLite rows written | 100,000 / day | a few per POST (slot + alarm) and alarm cleanup |
| SQL stored data | 5 GB total | under 13 KB per live room; zero after cleanup |

On the Free plan an exceeded limit is not billed: further operations of that
type **fail with an error** until the daily reset, so the relay stops working
for everyone until 00:00 UTC. Normal fan-game use stays far below these numbers;
abuse can reach them (see the rate-limit note below).

Each room is one Durable Object, alive for two minutes. When the alarm finds
every slot expired it deletes the alarm and then calls `storage.deleteAll()`,
so an abandoned room leaves no stored rows behind.

**Deployed version.** Nothing in this repository deploys the Worker (no
workflow runs `wrangler deploy`). Whoever operates the endpoint deploys it by
hand, so the code and `compatibility_date` (`2025-04-01`) live on the endpoint
cannot be known from the repo: compare the operator's deployment
(`wrangler deployments list`) with this file before assuming a fix is live.

## What it does not do

- No logging of payloads, addresses, or who talked to whom.
- Each slot expires after two minutes. Reads reject expired slots immediately;
  the alarm deletes expired slots at the earliest slot expiry and reschedules
  for any live slot. Platform-delayed alarms can delay physical cleanup, but a
  later write cannot postpone cleanup of an older slot.
- No accounts, usernames, or directory.
- Only structurally valid `v2.` base64url envelopes are accepted, with room for
  the salt, IV, and authentication tag, capped at 12 KB. Encryption and envelope
  authentication belong to the clients; the relay cannot establish either from
  the encoding alone. There is no plaintext compatibility path.
- Any method other than GET/POST/OPTIONS is answered 405 in the outer Worker,
  before the rate limiter and before a Durable Object is named.
- The Worker applies a defense-in-depth fixed-window limit before allocating a
  Durable Object (20 writes and 180 reads per IP per minute). The counters live
  in one isolate's memory: Cloudflare runs many isolates, each with its own
  counters, so the real per-IP ceiling is that times the isolates reached. Even
  a single isolate admits 200 requests/minute per IP (288,000/day), above the
  100,000 Durable Object requests/day of the Free plan, so the limiter does not
  keep one determined client inside the free quota. It stops casual bulk room
  creation only; an operator who needs a real boundary adds a Cloudflare WAF
  rate-limiting rule (account-wide) in front of the Worker.

## If you never deploy it

Nothing breaks — room codes still work. `NetRendezvous.configured()` is now
always true: with no private relay set, the public-broker backend does the
rendezvous, and `usingPrivateRelay()` reports which path is live. The invite
link and QR code still need nothing at all. Deploying this worker is only for
moving the room-code path onto infrastructure you control.
