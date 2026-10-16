// @ts-check
/**
 * js/core/log.js in a real page — the levels, the ring buffer, and the __apex door.
 *
 * Every assertion here corresponds to a way the facility can be quietly useless
 * rather than broken: retention that silently lags the console level, a ring
 * that holds object references, a namespace that prints its own tag twice. None
 * of those throw, so nothing else in the suite would notice.
 */
import { sharedTest as test, expect } from "../helpers/fixtures.js";

test.describe("Log", () => {
  test("is live before any game module evaluates", async ({ racePage }) => {
    // Log must load FIRST — a module logging at evaluation time would otherwise
    // take the whole page down with a ReferenceError.
    const r = await racePage.evaluate(() => ({
      present: typeof window.Log !== "undefined",
      namespaces: window.Log.NAMESPACES,
      level: window.__apex.logLevel(),
    }));
    expect(r.present).toBe(true);
    expect(r.namespaces).toContain("scenery");
    expect(r.level.console).toBe("warn");   // the shipped default: unchanged from bare console.warn
  });

  test("retains at the buffer threshold and prints at the console one", async ({ racePage, consoleLines }) => {
    const r = await racePage.evaluate(() => {
      window.Log.clear();
      window.Log.warn("scenery", "probe warn");
      window.Log.debug("scenery", "probe debug below threshold");
      const shipped = window.__apex.logs({ ns: "scenery" }).map((x) => x.msg);
      window.__apex.logLevel("scenery:debug");
      window.Log.debug("scenery", "probe debug raised");
      return { shipped, raised: window.__apex.logs({ ns: "scenery" }).map((x) => x.msg) };
    });
    expect(r.shipped).toContain("probe warn");
    expect(r.shipped).not.toContain("probe debug below threshold");
    // Raising the CONSOLE level must raise retention with it: the ring is what
    // you read after the fact, so it can never hold less than what printed.
    expect(r.raised).toContain("probe debug raised");
    expect(consoleLines.some((l) => l.includes("[scenery] probe warn"))).toBe(true);
  });

  test("prefixes the namespace exactly once", async ({ racePage, consoleLines }) => {
    await racePage.evaluate(() => window.Log.warn("gfx", "single tag please"));
    const line = consoleLines.find((l) => l.includes("single tag please"));
    expect(line).toBeTruthy();
    expect(line.match(/\[gfx\]/g)).toHaveLength(1);
  });

  test("flattens records instead of holding references", async ({ racePage }) => {
    // A record that kept a live mesh alive for 500 entries would turn a
    // diagnostic into a leak, so args are stringified at emit time.
    const r = await racePage.evaluate(() => {
      window.Log.clear();
      const big = { keep: "me" };
      window.Log.warn("game", "object arg", big);
      const rec = window.__apex.logs({ ns: "game" }).pop();
      return { msg: rec.msg, msgType: typeof rec.msg, level: rec.level, hasId: typeof rec.id === "number" };
    });
    expect(r.msgType).toBe("string");
    expect(r.msg).toContain('{"keep":"me"}');
    expect(r.level).toBe("warn");
    expect(r.hasId).toBe(true);
  });

  test("a track build reports through it, so the ring explains a build", async ({ loadTrack, racePage }) => {
    await loadTrack("monaco");
    const r = await racePage.evaluate(() => {
      const all = window.__apex.logs();
      return { namespaces: [...new Set(all.map((x) => x.ns))], count: all.length };
    });
    // Monaco is a street circuit: its build always suppresses some dressing.
    expect(r.count).toBeGreaterThan(0);
    expect(r.namespaces.some((ns) => ns === "scenery" || ns === "track")).toBe(true);
  });

  test("logs() filters, and a bad spec is ignored rather than thrown", async ({ racePage }) => {
    const r = await racePage.evaluate(() => {
      window.Log.clear();
      window.Log.warn("net", "a"); window.Log.warn("net", "b"); window.Log.error("data", "c");
      const since = window.__apex.logs({ ns: "net" })[0].id;
      let threw = false;
      try { window.__apex.logLevel("not-a-level"); } catch (_) { threw = true; }
      return {
        byNs: window.__apex.logs({ ns: "net" }).length,
        byLevel: window.__apex.logs({ level: "error" }).map((x) => x.msg),
        sinceCount: window.__apex.logs({ since }).length,
        limited: window.__apex.logs({ limit: 1 }).length,
        threw,
      };
    });
    expect(r.byNs).toBe(2);
    expect(r.byLevel).toEqual(["c"]);          // `level` is a ceiling, not an exact match
    expect(r.sinceCount).toBe(2);              // everything AFTER that id
    expect(r.limited).toBe(1);
    expect(r.threw).toBe(false);               // a typo in a URL must not take the game down
  });
});
