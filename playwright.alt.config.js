// @ts-check
// Throwaway config for running verification specs against a SEPARATE static
// server (port 3457) so they don't share the dev server / browser with a
// long-running baseline-regen `playwright test` on the default port. Start the
// server yourself: `npx serve -l 3457 --no-clipboard`.
import base from "./playwright.config.js";

export default {
  ...base,
  use: { ...base.use, baseURL: "http://localhost:3457" },
  webServer: undefined,   // server is started manually, don't auto-spawn
};
