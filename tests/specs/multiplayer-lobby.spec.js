// @ts-check
// The VS FRIEND lobby — the part a person actually touches.
//
// There is no server anywhere in this design, so the two players ARE the
// signalling channel: the host generates an invite code, sends it by whatever
// means, and pastes back the answer. These specs cover the screen and the
// profile exchange. They deliberately do NOT try to complete a real WebRTC
// connection — that needs two browsers and a network path, and asserting on
// NAT traversal in CI would produce a test that fails for reasons no one can
// fix. The wire itself is covered by the loopback suites instead.
//
// The claim worth testing hardest is the profile one: what crosses the wire is
// part IDS, never resolved multipliers. Since Phase 0 made upgrades per-car, a
// peer that could declare `{cornering: 9}` would simply be faster.
//
// Anything that reaches a transport calls __apex.lobbyFake(true) first, which
// swaps the lobby's transport factory for loopback endpoints. That is a
// necessity, not a shortcut: measured in this environment an RTCPeerConnection
// constructs fine but ICE gathering NEVER completes — one candidate, still
// "gathering" after six seconds — and a PC left spinning starves the box. A
// test that builds one does not fail, it HANGS, which is far worse.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function menu(page, fakeTransport = true) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  if (fakeTransport) await page.evaluate(() => window.__apex.lobbyFake(true));
}

test.describe("VS FRIEND lobby", () => {
  test.use({ viewport: LANDSCAPE });

  // THE REAL TRANSPORT CAN BE BUILT AT ALL.
  //
  // Every other test in this file swaps in a fake transport on purpose — a real
  // RTCPeerConnection never finishes ICE in a sandboxed browser, so a spec that
  // builds one HANGS rather than fails. The cost of that is a blind spot
  // exactly where it hurts: rtc() returns null on ANY construction error and
  // the lobby then reports "this browser cannot do WebRTC", so breaking it
  // removes multiplayer entirely while every spec in this file still passes.
  //
  // Not hypothetical. A referenced-but-undefined helper inside that try turned
  // every rtc() call into null, and nothing in the suite noticed. CONSTRUCTING
  // one is safe and fast — it is only WAITING for ICE that hangs — so this
  // builds one and closes it immediately.
  test("the REAL transport can be constructed, not just the fake one", async ({ page }) => {
    await menu(page);
    const out = await page.evaluate(() => {
      const t = NetTransport.rtc({ role: "host", name: "probe" });
      const ok = !!(t && t.pc);
      const policy = ok ? (t.pc.getConfiguration().iceTransportPolicy || "all") : null;
      if (t) { try { t.close(); } catch (e) {} }
      return { supported: NetTransport.supported(), ok, policy };
    });
    expect(out.supported).toBe(true);
    expect(out.ok, "rtc() returned null — the lobby would say WebRTC is unavailable").toBe(true);
    // The default must stay "all". Relay-only is a deliberate opt-in for
    // exercising the TURN leg; shipping it on would break every direct pair.
    expect(out.policy).toBe("all");
  });

  test("the menu has a way in, and it opens the lobby", async ({ page }) => {
    await menu(page);
    await expect(page.locator("#vsfriend")).toBeHidden();
    await page.click("#mb-vs");
    await expect(page.locator("#vsfriend")).toBeVisible();
    // Starts on the host/join choice, not mid-flow.
    await expect(page.locator("#vs-pick")).toBeVisible();
    await expect(page.locator("#vs-hosting")).toBeHidden();
    await expect(page.locator("#vs-joining")).toBeHidden();
  });

  test("closing the lobby tears the half-built connection down", async ({ page }) => {
    // Abandoning the screen must not leave an RTCPeerConnection gathering
    // candidates forever.
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    await expect(page.locator("#vs-joining")).toBeVisible();
    await page.click("#vs-close");
    await expect(page.locator("#vsfriend")).toBeHidden();
    expect(await page.evaluate(() => window.__apex.lobby().connected)).toBe(false);
  });

  test("hosting moves to the invite step and reports progress", async ({ page }) => {
    // Asserts the SCREEN advances and says something, not that a code appears:
    // producing a real code needs ICE, which this environment cannot finish.
    // The code FORMAT is pinned in tests/unit/net-transport.test.mjs against a
    // synthetic SDP instead — the part we actually wrote.
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-host");
    await expect(page.locator("#vs-hosting")).toBeVisible();
    await expect(page.locator("#vs-pick")).toBeHidden();
    // Something must be said either way — a silent screen is the one outcome
    // that leaves a player with nothing to do.
    await expect(page.locator("#vs-status")).not.toHaveText("");
  });

  test("a junk code is refused with an explanation, not a stack trace", async ({ page }) => {
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    // The code is validated BEFORE the connection is touched, so this reports
    // the real problem ("that isn't an Apex code") rather than a generic
    // transport error the player could do nothing about.
    await page.fill("#vs-invite-in", "not-a-real-code");
    await page.click("#vs-make-answer");
    await expect(page.locator("#vs-status")).toHaveClass(/vs-error/);
    const msg = await page.textContent("#vs-status");
    expect(msg).toMatch(/apex invite code/i);
  });

  test("an empty box asks for the code rather than failing silently", async ({ page }) => {
    await menu(page);
    await page.click("#mb-vs");
    await page.click("#vs-join");
    await page.click("#vs-make-answer");
    await expect(page.locator("#vs-status")).toHaveClass(/vs-error/);
  });

  test("the profile on the wire is IDS, never resolved multipliers", async ({ page }) => {
    // The security-relevant claim. If multipliers crossed the wire, a peer
    // could declare itself faster; instead it declares which parts it fitted
    // and both sides compute the numbers the same way.
    await menu(page);
    const p = await page.evaluate(() => window.__apex.lobby().profile);

    expect(p.team).toEqual(expect.any(String));
    expect(typeof p.driver).toBe("number");
    // No performance numbers anywhere in the payload.
    const flat = JSON.stringify(p);
    for (const banned of ["cornering", "braking", "accel", "speed"]) {
      expect(flat).not.toContain(banned);
    }
  });

  test("a peer's multipliers are recomputed locally from its ids", async ({ page }) => {
    await menu(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const honest = A.lobby().profile;
      const resolved = A.lobbyMods(honest);
      // A peer that tries to declare its own numbers gets them ignored: only
      // `team` and `parts` are read, and the multipliers come out of the same
      // Parts.getMods() the local car uses.
      const liar = Object.assign({}, honest, {
        cornering: 9, braking: 9, accel: 9, speed: 9,
      });
      return { resolved, lied: A.lobbyMods(liar) };
    });

    expect(out.resolved).toBeTruthy();
    for (const k of ["speed", "accel", "cornering", "braking"]) {
      expect(typeof out.resolved[k]).toBe("number");
      expect(out.resolved[k]).toBeLessThan(5);          // a sane multiplier
      expect(out.lied[k]).toBeCloseTo(out.resolved[k], 6);   // the lie changed nothing
    }
  });

  test("an unknown team in a profile is refused rather than crashing", async ({ page }) => {
    await menu(page);
    const out = await page.evaluate(() => ({
      unknown: window.__apex.lobbyMods({ team: "not-a-team", driver: 0 }),
      empty: window.__apex.lobbyMods(null),
    }));
    expect(out.unknown).toBe(null);
    expect(out.empty).toBe(null);
  });

  test("the invite goes out as a link, and the link opens straight into joining",
    async ({ page }) => {
      // The point of the link: the guest never has to work out WHICH box to
      // paste into. Opening it fills the invite field and shows the joining
      // step. Without this the fragment format is decoration — inviteFromUrl()
      // existed for a while with nothing on earth producing a link for it.
      await menu(page);
      // A REAL code, but built directly rather than by driving a handshake:
      // encodeCode needs no peer connection, and the fake transport has no .pc
      // to make one with. The handshake itself is covered by tools/net/rtc-e2e.mjs
      // against two real browsers; what is under test here is the link.
      // Bare identifier, not window.NetHandshake: the modules are top-level
      // `const` in classic scripts, which land in the global LEXICAL scope and
      // never become properties of window.
      const code = await page.evaluate(() => NetHandshake.encodeCode({
        b: 1, k: "offer", p: { team: "ferrari", driver: 0 },
        s: "v=0\r\na=ice-ufrag:abcd\r\n",
      }));
      const url = await page.evaluate((c) => NetHandshake.inviteUrl(c), code);
      expect(url).toContain("#vs=");
      // The FRAGMENT, never the query string — a fragment is not sent to the
      // server, and there being no server is the whole design.
      expect(url.split("#")[0]).not.toContain(code);

      // about:blank FIRST. Navigating from "/" to "/#vs=..." differs only in
      // the fragment, which the browser treats as a same-document navigation —
      // no reload, so wire() never runs again and the link appears not to work.
      // A guest opening the link genuinely loads the page, so the test must too.
      await page.goto("about:blank");
      await page.goto(url);
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
      await expect(page.locator("#vsfriend")).toBeVisible();
      await expect(page.locator("#vs-joining")).toBeVisible();
      await expect(page.locator("#vs-invite-in")).toHaveValue(code);
      // Leave nothing gathering: join() built a real RTCPeerConnection on this
      // fresh load, and an abandoned one keeps trying candidates.
      await page.click("#vs-close");
    });

  test("SHARE falls back to the clipboard, and says so instead of failing", async ({ page }) => {
    // navigator.share does not exist in this browser, which is exactly the
    // fallback path most desktops take. The button must still do something
    // useful and must not claim to have shared.
    await menu(page);
    await page.click("#mb-vs");

    // The label names what it will actually do here — a button saying SHARE
    // that silently copies has lied to the player. Headless Chromium has no
    // navigator.share, which is exactly the case being covered.
    expect(await page.evaluate(() => !!navigator.share)).toBe(false);
    await expect(page.locator("#vs-share-invite")).toHaveText("COPY LINK");

    const out = await page.evaluate(async () => {
      let copied = null;
      // Stub the clipboard: headless Chromium has no permission for it by
      // default, and this is testing OUR fallback, not Playwright's permission
      // model. defineProperty, not assignment — navigator.clipboard is a
      // read-only accessor and `=` on it fails SILENTLY.
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t) => { copied = t; } },
      });
      document.getElementById("vs-invite").value = "APEX1.s.PRETEND";
      const ok = await window.__apex.lobbyShare();
      return { ok, copied, status: document.getElementById("vs-status").textContent };
    });
    expect(out.ok).toBe(true);
    expect(out.copied).toContain("#vs=");
    expect(out.status).toMatch(/copied/i);
  });

  test("a failed connection says WHICH failure it was", async ({ page }) => {
    // The two ways this fails need opposite responses from the player, and
    // from the outside they look identical. Reported live on a real device as
    // one flat "some networks block direct connections", which is true and
    // useless: it does not say whether trying another network would help.
    await menu(page);
    const out = await page.evaluate(() => {
      const f = window.__apex.lobbyFailure;
      return {
        noStun: f({ ice: "failed", connection: "failed", candidates: { host: 2, srflx: 0, relay: 0 } }, 20),
        blocked: f({ ice: "failed", connection: "failed", candidates: { host: 2, srflx: 1, relay: 0 } }, 20),
        stale: f({ ice: "failed", connection: "failed", candidates: { host: 2, srflx: 1, relay: 0 } }, 120),
      };
    });
    // No public address at all: another network genuinely may work.
    expect(out.noStun).toMatch(/never revealed a public address/i);
    expect(out.noStun).toMatch(/different network/i);
    // We had one and still could not get through: switching Wi-Fi is not the
    // fix, and telling them to try again would be a loop that cannot succeed.
    expect(out.blocked).toMatch(/relay/i);
    expect(out.blocked).not.toMatch(/different network/i);
    // Our own design causes this one: a human carries the codes, and a NAT
    // mapping expires in about a minute.
    expect(out.stale).toMatch(/stale/i);
  });

  test("the QR encodes the invite LINK, not the bare code", async ({ page }) => {
    // The distinction is the entire feature. A QR of the code shows the guest
    // 240 characters to retype; a QR of the link opens the game for them with
    // the joining step showing and the code already in the box. Encoder
    // correctness is proved against an independent decoder in
    // tests/unit/net-qr.test.mjs — what is checked here is which string we hand it.
    await menu(page);
    await page.click("#mb-vs");
    await expect(page.locator("#vs-qr-wrap")).toBeHidden();

    const out = await page.evaluate(() => {
      const url = NetHandshake.inviteUrl("APEX1.s.aB3-_x9Zq");
      const qr = NetQr.encode(url);
      return { url, size: qr && qr.size, version: qr && qr.version };
    });
    expect(out.url).toContain("#vs=");
    expect(out.version).toBeGreaterThan(0);
    // Odd, and 21 + 4n: the module count of a real QR symbol.
    expect((out.size - 21) % 4).toBe(0);
  });

  test("sharing before there is a code says so rather than sharing nothing",
    async ({ page }) => {
      await menu(page);
      await page.click("#mb-vs");
      const out = await page.evaluate(async () => {
        const ok = await window.__apex.lobbyShare("answer");   // never generated
        return { ok, status: document.getElementById("vs-status").textContent };
      });
      expect(out.ok).toBe(false);
      expect(out.status).toMatch(/nothing to share/i);
    });
});
