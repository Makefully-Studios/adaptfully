# Changelog

All notable changes to this project are documented in this file.

## 4.0.0 — 2026-09-03

### Removed

- **Cordova / PhoneGap** — Dropped `CordovaPackager`, `packager: "cordova"`, and the `cordova` package keyword. Android/iOS prebuild and Wrapfully family resolution are Capacitor-only.
- **`CordovaPackager` export** — No longer exported from `@makefully/adaptfully`.

### Changed

- **`resolveFamily(..., 'cordova')`** — Throws an explicit error directing clients to Capacitor.
- **Major version** — Breaking for projects still configured with Cordova.

## 3.16.1 — 2026-09-03

### Fixed

- **`adaptfully build` signing credentials** — Capacitor/Cordova zip builds now package `assets/meta/deployments/<canonical>/` (e.g. `ios-dev` → `ios`) so Wrapfully can sign device IPAs. Previously only `release` shipped deployment folders, so `ios:dev-build` arrived on the Mac without `apple/development.*`.

## 3.16.0 — 2026-09-02

### Added

- **Apple-only iOS `social-auth`** — `providers.google: false` + `providers.apple: true` no longer requires `google.webClientId`. On iOS, missing `apple.clientId` defaults to the platform `packageName`; runtime also falls back to `window.gameConfig.packageName`.
- **Publish gitignore** — ignore `assets/meta/deployments/**/apple/` (`.p12` / `.mobileprovision`).

### Docs

- Registrations are owned by prebuild HTML markers (do not double-inline at compile time).
- Capacitor iOS signing is file-based under `apple/` (not Cordova-era `build.json` ios fields).

## 3.15.1 — 2026-09-01

### Fixed

- **Capacitor/Cordova HTML injection** — packager `<meta>` tags (CSP, viewport) are injected into `<head>`; script tags stay in the body `<!-- adaptfully -->` slot. Fixes browsers ignoring CSP delivered outside `<head>`.

## 3.15.0 — 2026-08-24

### Added

- **`http-analytics`** — vendor-neutral analytics plugin that batches `track` events to `config.analyticsEndpoint` via `sendBeacon` / `fetch` (works on web, Electron `file://`, and Capacitor). Config: `analyticsEndpoint`, `analyticsGameId`, `analyticsEnabled`, optional `analyticsPlatform` / `analyticsAppVersion`. API: `track`, `identify`, `setContext`, `optOut` / `optIn` / `isOptedOut`, `flush`.
- **`noop-analytics`** — same surface with no network I/O (local/dev and privacy-off builds).

## 3.14.0 — 2026-08-21

### Added

- **`platform.supportsLogout()`** — whether `logout()` yields a durable signed-out state. Google, social, and dev return `true`; Steam returns `false` (Steamworks identity returns on `autoLogin`). Defaults to `false` when the auth plugin omits the method. Games should hide Sign out UI when this is false.
- **`platform.requiresEmail()`** — whether a complete identity needs email in addition to id. Google, social, and dev return `true`; Steam returns `false`. Defaults to `true` when unimplemented. Use instead of branching on `auth.name === 'steam'` for session completeness and account-sync routing.

## 3.13.0 — 2026-07-24

### Added

- **Per-platform `config.*` overrides** — `config.platforms.<key>.packageName` (and other identity/branding fields) override top-level `config.*` defaults for that platform. Control fields (`packager`, `registrations`, `builder`, `deployments`, `steamId`, `socialLogin`, `steamworks`) are unchanged. Helpers: `resolvePlatformConfig`, `getConfigValue`, `resolveConfigForBuild`.

## 3.12.1 — 2026-07-23

### Fixed

- **Publish path prompts** — strip wrapping quotes from user-supplied paths (e.g. pasted `"D:\…\key.json"`) so absolute paths are not treated as project-relative.

## 3.12.0 — 2026-07-23

### Added

- **`adaptfully google-publish`** — import a Google Play service-account JSON into `assets/meta/deployments/android/google.json` (or `--deployment` / `--output`) and ensure `manifest.json` has `"type": "google"`.
- **`adaptfully apple-publish`** — prompt for (or accept) App Store Connect credentials and write `assets/meta/deployments/ios/apple.json` with `"type": "apple"` on the deployment manifest.
- **Publish helpers update `.gitignore`** — `steam-publish` / `google-publish` / `apple-publish` append standard `assets/meta/deployments/**` credential ignore patterns (and any custom `--output` under the project) so secrets are less likely to be committed.

### Changed

- **`adaptfully steam-publish`** replaces the credential CLI formerly named `steam-auth` (runtime plugin `steam-auth` is unchanged). `adaptfully steam-auth` still works as a deprecated alias.
- Steam publish also ensures the deployment `manifest.json` has `"type": "steam"`.

## 3.11.0 — 2026-07-23

### Added

- **Layered icon validation** — build/deploy/release zips always include `meta/icon-foreground.png` and `meta/icon-background.png`. When project icons are missing under `assets/meta/`, Adaptfully **warns** (does not fail) and ships packaged placeholder icons from `lib/assets/`.
- **`resolveMetaIcons` / `appendMetaIcons`** — exported helpers for resolving project vs placeholder icon paths.

### Changed

- Legacy meta packaging skips re-adding icon filenames so placeholders and project icons are not duplicated in the zip.

## 3.10.0 — 2026-07-17

### Added

- **`social-auth`** — Capgo `@capgo/capacitor-social-login` auth plugin for Capacitor platforms. Requires `packager: "capacitor"` and `platforms.<name>.socialLogin` provider config. Prebuild writes `social-login-config.js`; Wrapfully installs the native plugin when `socialLogin` is set on the build spec.
- **`CapacitorPackager`** CSP/viewport HTML extras and social-auth validation/templates.

### Changed

- **Builder family defaults** — `android` / `ios` / `ios-sim` (and `-dev`) resolve to Wrapfully family **`capacitor`**. Explicit `packager: "cordova"` still selects Cordova for that platform. Composite `cordova` / `apple` routes are not used.
- **`resolveBuildSpec`** includes `socialLogin: boolean`.
- **Single-target Wrapfully POSTs** go to the target route (`/android/build`, `/ios/release`, …) instead of the family route (`/capacitor/...`), so OS relay and existing target routes keep working.

## 3.9.0 — 2026-07-15

### Added

- **`pwa` Wrapfully family** — `resolveFamilyFromTarget('pwa')` / `resolveBuildSpec` return family `pwa` when `builder: "pwa"`, including with `packager: "web"`.

## 3.8.2 — 2026-07-14

### Fixed

- **Release/deploy zips** resolve `assets/meta` and deployment credential dirs to absolute POSIX paths before `archiver.directory()`, and log which deployments were packaged (or skipped). Prevents empty `meta/deployments` payloads that made Wrapfully skip Steam.

## 3.8.1 — 2026-07-14

### Fixed

- **Extract mode** clears stale `output/artifacts/`, `wrapfully-build.json`, and `wrapfully-status.json` before unpacking a Wrapfully response so nested `artifacts/artifacts` leftovers cannot accumulate across runs.

## 3.8.0 — 2026-07-10

### Changed

- **`steam-auth` Steamworks app ID** moves from top-level `config.steamId` to **`platforms.<name>.steamId`**. Steam **upload** app IDs belong in each deployment’s `manifest.json` (Wrapfully), not in Adaptfully client config.

## 3.7.0 — 2026-07-09

### Added

- **`adaptfully release <platform>`** stage — single Wrapfully call for build + configured deployments.
- **`resolveBuildSpec()`** — returns `{ family, targets, platformKey, steamworks, deployments }` for multi-target platforms.
- **`createSourceArchive`**, **`createDeployArchive`**, **`createReleaseArchive`** — split zip profiles for build/deploy/release.
- **`--artifact <path>`** on deploy for promoting a prior build artifact.

### Changed

- **`send()`** targets Wrapfully v2 URLs: `/{family}/build`, `/{family}/release`, `/deploy/{key}`.
- Default **`deployments`** when omitted is `["zip"]` instead of the platform key.
- **`builder`** in platform config may be a string or array (e.g. `["win","mac","linux"]`).

## 3.6.1 — 2026-07-06

### Changed

- Web deploy uses the same Wrapfully zip-and-post path as Steam (`webapp` builder). Adaptfully does not implement SFTP or other publish targets directly — credentials in `assets/meta/publish/` travel in the zip for Wrapfully to use.

## 3.5.0 — 2026-06-27

### Added

- **`adaptfully steam-auth`** — installs steamcmd if missing, runs an interactive login, and writes `assets/meta/publish/steam.json` with `configVdf` and optional `ssfn` sentry data for Steam Guard accounts.
- Exported helpers: `runSteamAuth`, `buildSteamPublishJson`, `collectSteamAuthFiles`, `ensureSteamcmd`.

## 3.4.0 — 2026-06-25

### Changed

- Electron **`main.js`** allows same-app `file://` navigation while still opening external http(s) links in the system browser.
- Steam builds (`steam-auth`) set renderer **`sandbox: false`** so the steamworks preload bridge can reach the main process; non-Steam Electron builds keep `sandbox: true`.

## 3.3.0 — 2026-06-23

### Added

- **Packager classes** — `Packager`, `WebPackager`, `ElectronPackager`, `CordovaPackager`, and `CapacitorPackager` encapsulate per-packager prebuild behavior behind a shared API (`validate`, `applyTemplates`, `applyHtmlExtras`, `prebuild`).
- **`createPackagerForPlatform(platformKey, pkg, options)`** — factory that resolves the configured packager and returns an instance. Options include `platforms` (target platform keys, e.g. `ios` + `android` for Cordova) and `platformKey` (active prebuild platform).
- **Plugin detection** — `collectUsedPlugins()` and `usesPlugin(id)` inspect standard Adaptfully auth/storage registrations across targeted platforms so packagers can adapt output (e.g. Electron injects steamworks init when `steam-auth` is registered).
- **Cordova prebuild** — writes `cordova.js` stub, injects CSP/viewport meta tags and `game-config.js` script tags into HTML.
- **`buildElectronMain()` / `buildElectronPreload()`** — exported helpers that compose Electron shell files (used by `ElectronPackager` and available for tests or extensions).

### Changed

- Prebuild runs packager work through a single `packager.prebuild(dest, htmlPaths)` call instead of separate template/HTML helper functions.
- Electron **`main.js`** and **`preload.js`** are composed from embedded strings in `ElectronPackager` rather than read from disk templates.
- **`web`** packager writes **`game-config.js`** during prebuild when the platform key is **`uwp`**.

### Removed

- **`lib/templates/`** — packager output is generated in code; no template files are shipped with the package.
- **`getTemplatesDir()`**, **`resolvePackagerTemplateDir()`**, and **`applyTemplateMarker()`** from the public API.

## 3.2.0 — 2026-06-16

### Added

- **`config.platforms.<platform>.packager`** — `web` (default), `electron`, `cordova`, or `capacitor`. Controls which template files are added during prebuild.
- **`lib/templates/`** — packager-specific templates (starting with `electron/main.js` and `electron/preload.js`).
- Electron prebuild writes **`main.js`** automatically. When **`steam-auth`** is registered, Adaptfully also writes **`preload.js`** with steamworks.js init and overlay setup in `main.js`.
- **`steam-auth` requires `packager: "electron"`** — prebuild throws if steam-auth is used on a non-electron platform or without `config.steamId`.

## 3.1.1 — 2026-06-16

### Added

- **steam-auth** integrates with [steamworks.js](https://github.com/ceifa/steamworks.js): reads Steam ID and persona name from shell-provided bridges (`__ADAPTFULLY_STEAMWORKS__`, `steamworks`, `electronAPI`).
- Steam auth supports `autoLogin()` and `supportsAutoLogin()` when the Steam client is available.

## 3.1.0 — 2026-06-18

### Added

- Built-in storage plugins: `localStorage` (sync) and `indexedDB` (async).
- Register with `"storage": "localStorage"` or `"storage": "indexedDB"` in `config.platforms.<platform>.registrations`.

### Changed

- Auth helpers use registered `storage` only (no implicit fallbacks).

## 3.0.3 — 2026-06-18

### Added

- `platform.autoLogin()` and `platform.supportsAutoLogin()` for session restore without UI.
- Google auth reads `config.autoLoginStorageKey` (default: `lastLoggedIn`) when deciding whether to attempt silent OAuth.

### Changed

- Auth plugins expose `autoLogin()` only (removed `silentLogin()`).

### Fixed

- Google auth reads OAuth config and stored tokens lazily so bridge-registered `config`/`storage` are applied before auto-login runs.
- Prebuild injects deploy bridge scripts after `core.js` and before auth plugin runtime scripts.
- Auth storage helper falls back to `localStorage` when `storage` is not registered via Adaptfully.

## 3.0.2 — 2026-06-18

### Fixed

- Deploy script paths without a leading `/` are emitted as page-relative `script src` values (for subdirectory hosting).

## 3.0.1 — 2026-06-17

### Added

- `config.htmlInjections` — list of deploy-relative HTML paths to inject during prebuild (default: `["index.html"]`).

### Fixed

- Prebuild injects only configured HTML files instead of scanning every `.html` in the deploy folder.

## 3.0.0 — 2026-06-17

### Added

- Three-stage Adaptfully pipeline: `adaptfully prebuild`, `adaptfully build`, and `adaptfully deploy`.
- `prebuildPlatform()` copies `deploy/` to `output/<platform>-prebuild/` and applies platform registrations to all HTML files.
- `adaptfully` CLI binary (`adaptfully prebuild|build|deploy <platform>`).
- Config-driven platform registrations via `config.platforms.<platform>.registrations` in `package.json`.
- Platform APIs: `adaptfullyInjectionForPlatform()`, `resolveRegistrationAssets()`, `resolveBuilderForPlatform()`, `resolveCliPlatformAndBuilder()`.

### Changed

- `wrapfully-deploy` runs the `deploy` stage (prebuild + Wrapfully upload). Builder names (`win`, `steam`, etc.) map to platform keys via `config.platforms` or defaults.
- `build` and `deploy` stages always prebuild first; the on-disk `deploy/` folder is left unchanged.
- Missing platform registrations skip injection with a console note; each registration is logged as it is applied.

### Removed

- Legacy channel-based build helpers: `getBuildChannel`, `getAuthScriptsForChannel`, `authRegistrationScript`, `authRegistrationForChannel`, `devAuthRegistration`, `extScriptsForBuildChannel`, `filterIncludesForBuildChannel`, `distributionSettingsForBuild`.
- Deprecated builder-based injection helpers: `adaptfullyInjectionForBuilder`, `prepareDeployIndexHtml`, `deployFromCli`.
- `adaptfully.getInstance()` from the browser runtime.
- Root `deploy.js` compatibility shim.

## 2.1.0 — 2026-06-15

### Changed

- Node tooling is now full ESM (`import`/`export`) with no `.cjs` / `.mjs` split.
- Deploy logic split into focused modules: `archive.js`, `config.js`, `deploy.js`, `report.js`.
- Runtime uses ES classes, private fields, optional chaining, and shared `auth/_helpers.js`.
- Minimum Node version raised to 18; dependencies updated (`archiver` 7, `axios` 1.7).

## 2.0.0 — 2026-06-15

### Added

- **Adaptfully** runtime library: `adaptfully.register()` / `adaptfully.get()` for platform services.
- Auth plugins: Google (`adaptfully.auth.Google`), Steam (`adaptfully.auth.Steam`), and dev (`adaptfully.auth.Dev`).
- `Platform` wrapper for uniform auth API across deployment channels.
- Node build helpers: `getAuthScriptsForChannel()`, `authRegistrationScript()`, `filterIncludesForBuildChannel()`, and related exports.
- Programmatic deploy API exported from `lib/node/deploy.js`.

### Changed

- Package renamed from `@makefully/wrapfully-client` to `@makefully/adaptfully`.
- Deploy CLI moved to `bin/wrapfully-deploy.js`; root `deploy.js` remains as a compatibility shim.

## 1.2.0 — 2026-06-11

### Added

- Documentation for Electron debug builders: `win-dev`, `mac-dev`, `linux-dev`, and `steam-dev`.

## 1.1.2 — 2026-06-12

### Fixed

- npm trusted publishing workflow: upgrade npm explicitly, unset stale `NODE_AUTH_TOKEN`, and use `https://` repository URL format required by OIDC.

## 1.1.1 — 2026-06-11

### Added

- npm trusted publishing workflow (`.github/workflows/publish.yml`) with OIDC — no `NPM_TOKEN` required.
- `PUBLISHING.md` maintainer guide; publishes automatically on version bumps to `main`.

## 1.1.0 — 2026-06-11

### Added

- Reads `wrapfully-status.json` from `./output/` after extraction and prints build events to the console.
- Exits with code 1 when the server reports build errors, so CI and scripts can detect failures.
- Icons documentation in README (1536×1536 layered PNG requirements).
- Documentation for Steam cross-platform routing and credential relay between build servers.

### Changed

- Deploy waits for the response stream to finish before reporting build status.
- Legacy `{name}-{version}-{builder}.txt` status files are still printed when `wrapfully-status.json` is absent.

## 1.0.1

Initial published client with zip-and-post deploy flow.
