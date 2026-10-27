# Semantic UI inspection

Read the checkout’s UI inspector/explorer and browser-lock skills first. Inspect current `tools/list` schemas: this workflow requires a checkout exposing `apex_ui_inspect` and `apex_ui_diff`. On older checkouts use documented UI inspector CLI/hook routes; do not install another browser server or pretend a missing tool ran.

1. Establish the current build and select a screen from the checkout catalog. Inspect a focused control or screen before proposing a styling change. For example, after verifying `title` is a valid screen:

   ```json
   {"screen":"title","viewports":[{"width":1440,"height":900},{"width":844,"height":390}],"out":"artifacts/ui-baseline"}
   ```

   Pass this object to `apex_ui_inspect`. `selector` narrows controls; `styles` requests computed CSS for a CSS selector. `roundtrip`, `touch`, `boot`, and `safe` are optional specialized probes; consult the discovered schema before using them. The tool launches the local harness and owns the shared browser lock. Do not run it inside a garage session or alongside Playwright/browser tooling. Remote URLs are rejected.
2. Review control semantics, clipping, hit interception, geometry, computed styles and live-versus-saved setting/binding summaries. Unknown bindings are unknown; a completed command is not a UI pass. Inspect the screenshots and actual user controls, including keyboard/touch interactions where relevant. Avoid dumping entire DOMs or saves.
3. Capture after the change using the same screen, selectors, phases and viewports. Run browser-free `apex_ui_diff` with the two saved `inspection.json` paths:

   ```json
   {"before":"artifacts/ui-baseline/inspection.json","after":"artifacts/ui-candidate/inspection.json"}
   ```

   Both inputs must be saved under `artifacts/` or `scratch/`, each at most 5 MiB. Mismatched viewports/phases are not a comparable pair. Interpret reported differences against the intended behavior; geometry change alone does not prove a defect.
4. Report Pass/Fail/Skip per control/layout, evidence paths, console findings and exact uncovered interactions. Preserve saved driving preferences and use a disposable profile. Run the checkout’s required verification before proposing a PR.

For host attachment failures, distinguish attached MCP from the checkout CLI: `bash tools/mcp/apex-tools-mcp.sh call apex_ui_inspect '<JSON>'` invokes the same one-shot operation. A CLI pass does not establish a host-tool pass. Use structured arguments, or properly shell-quoted literal JSON; never concatenate untrusted content into commands.

## Bounded user-flow planning

If available, `apex_ui_mission_plan` accepts one canonical mission (`first-race`, `customize-car` or `return-settings`), `maxShots` 1–5, and `timeoutSeconds` 30–180, with optional `out` and `dryRun`. It writes the canonical scenario and returns a pinned explorer replay command plus the required outer deadline. This is browser-free planning, not a completed playtest or a UI pass. Execute the returned local replay only through the checkout’s parent-owned, serialized browser workflow. Arbitrary scenarios, URLs and flags are not accepted.
