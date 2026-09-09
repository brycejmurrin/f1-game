// Shared presented-canvas capture for Playwright specs.
// HeadlessChrome GLX hides #game and blits onto #game-soft; locator("#game").screenshot()
// is the uncomposited GPU buffer. Import the probe helpers so tools and specs lockstep.
export {
  awaitPresentedFrame,
  presentedCanvasClip,
  screenshotPresentedCanvas,
} from "../../tools/capture/probe-page.mjs";
