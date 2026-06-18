# Changelog

All notable changes to this project are documented in this file.

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
