# The rendezvous relay (optional)

This is the **only server** in Apex 26, it is **optional**, and the game works
completely without it. Its whole job is to hold two small encrypted envelopes
for two minutes so that two browsers can find each other with a short room code
instead of pasting an invite back and forth. The six-character room code derives
the browser-side AES-GCM key; the Worker stores only versioned ciphertext.

Once WebRTC connects, every byte of gameplay goes **directly** between the two
players. The relay never sees another packet.

## Why it exists

The invite link and the QR code need no infrastructure and never break — they
are the primary way in, and they stay. But they need the two players to move a
code between them. A room code removes that:

```
HOST                        rendezvous                       GUEST
POST offer  ─────────────▶  [held, 2 min]
                            ◀──────── GET offer ──────────   types the code
                            ◀──────── POST answer ────────
GET answer  ◀─────────────
...direct P2P from here...
```

It is **not** a username system. A code is disposable: nothing is stored past
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
`DEFAULT_URL` and bump the cache version.

For a staging worker without editing the file, set it per-device instead:

```js
localStorage.setItem("apex26.rendezvous", "https://<worker>.workers.dev")
```

## Cost

One Durable Object per code, alive for two minutes. Durable Objects have been on
the Cloudflare **free plan** since April 2025 (100,000 requests/day, 313,000
GB-seconds/day). A signalling handoff uses that for seconds, so a fan game will
not leave the free tier. `wrangler.toml` uses `new_sqlite_classes` deliberately —
the SQLite-backed class is the one available on the free plan.

## What it does not do

- No logging of payloads, addresses, or who talked to whom.
- No persistence past the TTL: the alarm calls `deleteAll()`, so "nothing is
  retained" is enforced rather than intended.
- No accounts, usernames, or directory.
- Plaintext compatibility payloads are capped at 8 KB and encrypted envelopes
  at 12 KB, so the unauthenticated endpoint cannot be used as bulk storage.
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
