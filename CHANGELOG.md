# Changelog

All notable changes to this project are documented in this file.

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
