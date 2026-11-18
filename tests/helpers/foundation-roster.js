// @ts-check
// Which circuits tests/specs/circuit-foundation.spec.js registers (TK2-17, #3039).
// Pure, so tests/unit/foundation-roster.test.mjs pins the rule without Playwright.

/** The ids of `roster` that the APEX_CIRCUITS value `scope` asks for.
 *  Empty scope: all of them (every diff that is not circuit-only).
 *  A scope naming none of them: ALL of them as well — FAIL CLOSED. The plan
 *  only sets APEX_CIRCUITS on a circuit-only diff and only routes this spec
 *  when a touched circuit is in its roster, so a miss is a routing defect,
 *  and a defect must run more, never register nothing and read as green. */
export function foundationScope(roster, scope) {
  const want = String(scope || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!want.length) return [...roster];
  const hit = roster.filter((id) => want.includes(id));
  return hit.length ? hit : [...roster];
}
