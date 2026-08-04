# The rendezvous relay (optional)

This is the **only server** in Apex 26, it is **optional**, and the game works
completely without it. Its whole job is to hold two ~250-byte strings for two
minutes so that two browsers can find each other with a short room code instead
of pasting an invite back and forth.

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

It is **not** a username system. A code is disposable: nothing is stored,
nothing is claimed, nothing can be squatted or impersonated, and no personal
data is retained. There is no account to lose and nothing to moderate.

## Deploy

```sh
cd worker
npx wrangler deploy
```

Then paste the resulting `https://apex26-rendezvous.<you>.workers.dev` URL into
`DEFAULT_URL` at the top of `js/net/rendezvous.js`, and bump the cache version.

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
- Payloads are capped at 8 KB so an unauthenticated public endpoint cannot be
  used as free storage.

## If you never deploy it

Nothing breaks. `NetRendezvous.configured()` is false, and the room-code buttons
say a relay has not been deployed and point at the invite link — which needs
nothing at all. The option is shown rather than hidden on purpose: a feature that
disappears when a URL is unset guarantees the one person who could fix it never
finds out it exists.
