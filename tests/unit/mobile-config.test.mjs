/* mobile-config.test.mjs — Capacitor identity, config, Android manifest, Gradle.
 *
 * Run: node --test tests/unit/mobile-config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const identity = JSON.parse(readFileSync(join(ROOT, "mobile/lib/identity.json"), "utf8"));
const cap = JSON.parse(readFileSync(join(ROOT, "mobile/capacitor.config.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "mobile/package.json"), "utf8"));
const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const manifest = readFileSync(join(ROOT, "mobile/android/app/src/main/AndroidManifest.xml"), "utf8");
const gradle = readFileSync(join(ROOT, "mobile/android/app/build.gradle"), "utf8");
const vars = readFileSync(join(ROOT, "mobile/android/variables.gradle"), "utf8");
const gitignore = readFileSync(join(ROOT, "mobile/.gitignore"), "utf8")
  + readFileSync(join(ROOT, "mobile/android/.gitignore"), "utf8");
const html = readFileSync(join(ROOT, "index.html"), "utf8");

test("frozen identity is the single appId / scheme source", () => {
  assert.equal(identity.appId, "io.github.brycejmurrin.apex26");
  assert.equal(identity.appName, "Apex 26");
  assert.equal(identity.androidScheme, "https");
  assert.equal(cap.appId, identity.appId);
  assert.equal(cap.appName, identity.appName);
  assert.equal(cap.server.androidScheme, identity.androidScheme);
});

test("capacitor.config.json is a sideload-safe Capacitor 8 shape", () => {
  assert.equal(cap.webDir, "www");
  assert.equal(cap.android.minWebViewVersion, 100);
  assert.ok(cap.android.minWebViewVersion >= 100);
  assert.equal(cap.android.allowMixedContent, false);
  assert.equal(cap.android.webContentsDebuggingEnabled, false);
  assert.equal(cap.plugins.SystemBars.insetsHandling, "css");
  assert.ok(!Object.prototype.hasOwnProperty.call(cap.server, "url"));
  assert.equal(JSON.stringify(cap).includes('"url"'), false);
});

test("mobile/ is not a root npm workspace and pins Capacitor 8.x", () => {
  assert.equal(rootPkg.workspaces, undefined);
  assert.match(pkg.dependencies["@capacitor/core"], /^8\./);
  assert.match(pkg.dependencies["@capacitor/android"], /^8\./);
  assert.match(pkg.devDependencies["@capacitor/cli"], /^8\./);
  assert.equal(pkg.dependencies["@capacitor/core"], pkg.dependencies["@capacitor/android"]);
  assert.ok(existsSync(join(ROOT, "mobile/package-lock.json")));
});

test("AndroidManifest: INTERNET, optional CAMERA, no cleartext, fullSensor", () => {
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.hardware\.camera"[^>]*android:required="false"/);
  assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|READ_EXTERNAL_STORAGE|RECORD_AUDIO/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:screenOrientation="fullSensor"/);
  assert.match(manifest, /configChanges="[^"]*density/);
});

test("AndroidManifest: auto-backup is off (WebView storage holds the Spotify refresh token and career saves)", () => {
  assert.match(manifest, /<application\b[^>]*android:allowBackup="false"/);
  assert.doesNotMatch(manifest, /android:allowBackup="true"/);
});

test("Gradle wires APEX_VERSION_* env and optional APEX_KEYSTORE_* signing", () => {
  assert.match(gradle, /APEX_VERSION_CODE/);
  assert.match(gradle, /APEX_VERSION_NAME/);
  assert.match(gradle, /0\.0\.0-dev/);
  assert.match(gradle, /APEX_KEYSTORE_PATH/);
  assert.match(gradle, /minifyEnabled false/);
  assert.match(vars, /compileSdkVersion = 36/);
  assert.match(vars, /targetSdkVersion = 36/);
  assert.match(vars, /minSdkVersion = 24/);
});

test("gitignore covers www, Gradle build, local.properties, public assets", () => {
  assert.match(gitignore, /www\//);
  assert.match(gitignore, /\.gradle\//);
  assert.match(gitignore, /local\.properties/);
  assert.match(gitignore, /app\/src\/main\/assets\/public/);
  assert.match(gitignore, /capacitor-cordova-android-plugins/);
});

test("index.html skips SW registration on Capacitor as well as Electron", () => {
  assert.match(html, /nativeCap/);
  assert.match(html, /Capacitor\.isNativePlatform/);
  assert.match(html, /serviceWorker" in navigator && !nativeDesktop && !nativeCap/);
});

test("MainActivity keeps the screen on and hides system bars transiently", () => {
  const main = readFileSync(
    join(ROOT, "mobile/android/app/src/main/java/io/github/brycejmurrin/apex26/MainActivity.java"),
    "utf8",
  );
  assert.match(main, /FLAG_KEEP_SCREEN_ON/);
  assert.match(main, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(main, /WindowInsetsControllerCompat/);
});
