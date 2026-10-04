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

One Durable Object per opaque room id, alive for two minutes. Durable Objects have been on
the Cloudflare **free plan** since April 2025 (100,000 requests/day, 313,000
GB-seconds/day). A signalling handoff uses that for seconds, so a fan game will
not leave the free tier. `wrangler.toml` uses `new_sqlite_classes` deliberately —
the SQLite-backed class is the one available on the free plan.

## What it does not do

- No logging of payloads, addresses, or who talked to whom.
- No persistence past the TTL: the alarm calls `deleteAll()`, so "nothing is
  retained" is enforced rather than intended.
- No accounts, usernames, or directory.
- Only `v2.` envelopes are stored (no plaintext compatibility path), capped at
  12 KB, so the unauthenticated endpoint cannot be used as bulk storage.
- Any method other than GET/POST/OPTIONS is answered 405 in the outer Worker,
  before the rate limiter and before a Durable Object is named.
- The Worker applies a defense-in-depth, per-isolate fixed-window limit before
  allocating a Durable Object (20 writes and 180 reads per IP per minute). This
  protects normal deployments without changing the browser protocol, but is not
  a global distributed-abuse boundary; use a Cloudflare WAF rate-limit rule when
  operating the endpoint at a scale where account-wide enforcement matters.

## If you never deploy it

Nothing breaks — room codes still work. `NetRendezvous.configured()` is now
always true: with no private relay set, the public-broker backend does the
rendezvous, and `usingPrivateRelay()` reports which path is live. The invite
link and QR code still need nothing at all. Deploying this worker is only for
moving the room-code path onto infrastructure you control.
