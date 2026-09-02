# Adaptfully

Platform abstraction and Wrapfully deploy client for Makefully games.

- **Adaptfully runtime** — shared auth and platform services via `adaptfully.register()` / `adaptfully.get()`
- **Adaptfully pipeline** — prebuild, build, and deploy stages driven by `config.platforms`
- **Wrapfully deploy** — zip-and-post client for building desktop, mobile, and Steam packages

## Install

```bash
npm install @makefully/adaptfully
```

Maintainers: see [PUBLISHING.md](PUBLISHING.md) for npm trusted publishing setup.

## Adaptfully runtime

Games register platform services before load and retrieve them in-game. Adaptfully applies platform registrations during **prebuild** — games compile a neutral `deploy/` folder, then Adaptfully writes `output/<platform>-prebuild/` with the correct auth and plugin scripts injected into HTML.

### Pipeline stages

```bash
adaptfully prebuild web                       # deploy/ → output/web-prebuild/
adaptfully build steam                        # prebuild + zip and send to Wrapfully (default deployment)
adaptfully deploy web                         # prebuild + POST to Wrapfully for each of web's deployments
adaptfully deploy web --deployment web-prod   # deploy to a single named deployment
adaptfully deploy steam                       # prebuild + POST to Wrapfully steam builder
adaptfully steam-publish                      # one-time: log in with steamcmd → assets/meta/deployments/steam/steam.json
adaptfully google-publish --from ./sa.json    # one-time: import Play service account → deployments/android/google.json
adaptfully apple-publish                      # one-time: write App Store Connect creds → deployments/ios/apple.json
```

| Stage | What it does |
|-------|----------------|
| `prebuild` | Copy `deploy/` to `output/<platform>-prebuild/` and inject registrations into `config.htmlInjections` |
| `build` | Prebuild, then POST the result to Wrapfully (artifact zip only) |
| `deploy` | POST the prior build artifact from `./output/` to each configured deployment (or `--deployment`) |
| `steam-publish` | One-time local setup: install steamcmd, interactive login, write the `steam` deployment's `steam.json` (also updates `.gitignore`) |
| `google-publish` | One-time local setup: import a Play Console service-account JSON into the `android` deployment folder (also updates `.gitignore`) |
| `apple-publish` | One-time local setup: write App Store Connect credentials into the `ios` deployment folder (also updates `.gitignore`) |

`wrapfully-deploy` is a compatibility alias for `adaptfully deploy` when invoked with a Wrapfully builder name (`steam`, `win`, `android`, etc.).

### Platforms vs. deployments

A **platform** (`config.platforms.<key>`) describes *how* to build — registrations, packager, and the Wrapfully builder. A **deployment** describes *where* a build is sent, along with the credentials for that target. This lets a single build fan out to several targets of the same platform type (for example, a staging and a production SFTP host).

- A platform may declare `"deployments": ["<key>", ...]`. Each key maps to a credential folder at `assets/meta/deployments/<key>/`.
- If a platform has no `deployments` array, the platform key itself is the single default deployment key (so `steam` → `assets/meta/deployments/steam/`).
- `adaptfully deploy <platform>` prebuilds once, then sends to Wrapfully once per deployment. `--deployment <key>` narrows it to one.
- Only the selected deployment's folder is shipped in each zip (as `meta/publish/`), so other targets' credentials never travel with a build.

```json
"config": {
  "platforms": {
    "web":       { "registrations": { "auth": "google-auth" }, "deployments": ["web-testing", "web-prod"] },
    "steam":     { "packager": "electron", "registrations": { "auth": "steam-auth" } },
    "steam-dev": { "packager": "electron", "registrations": { "auth": "steam-auth" }, "deployments": ["steam"] }
  }
}
```

> **Back-compat:** projects with no `assets/meta/deployments/` directory keep the legacy behavior — the entire `assets/meta/` tree (including `assets/meta/publish/`) is shipped as `meta/`, and a single set of credentials is read from `meta/publish/`.

Place `<!-- adaptfully -->` / `<!-- /adaptfully -->` markers in your HTML templates where registrations should be injected (typically between split bundle scripts, before `account.js` runs). **Do not also inline Adaptfully auth scripts at game compile time** — prebuild/release owns the marker block for each platform.

```javascript
// Injected into deploy/index.html for the target platform (before game code):
adaptfully.register('auth', adaptfully.auth.Google);

// In-game:
const platform = adaptfully.get('auth');
platform.login(function (result) { /* ... */ });
```

### Storage plugins

| Plugin key | Registration | Runtime |
|------------|--------------|---------|
| `localStorage` | `adaptfully.register('storage', adaptfully.storage.LocalStorage())` | Sync key/value storage in the browser |
| `indexedDB` | `adaptfully.register('storage', adaptfully.storage.IndexedDB())` | Async key/value storage for larger payloads |

In-game:

```javascript
const storage = adaptfully.get('storage');
storage.set('playerName', 'Ada');
storage.getObject('currentGame');
```

### Analytics plugins

| Plugin key | Registration | Runtime |
|------------|--------------|---------|
| `http-analytics` | `adaptfully.register('analytics', adaptfully.analytics.Http())` | Batches events to a first-party collector URL |
| `noop-analytics` | `adaptfully.register('analytics', adaptfully.analytics.Noop())` | Same API; no network (dev / opt-out builds) |

Register under the `analytics` key (same pattern as `auth` / `storage`). Point the HTTP plugin at your collector via Adaptfully **config**:

| Config key | Purpose |
|------------|---------|
| `analyticsEndpoint` | `POST` URL for event batches (required for HTTP) |
| `analyticsGameId` | Game id stamped on payloads (falls back to `window.gameConfig.id`) |
| `analyticsEnabled` | Set `false` to disable without swapping plugins |
| `analyticsPlatform` / `analyticsAppVersion` | Optional overrides; otherwise `window.gameConfig` |

In-game:

```javascript
const analytics = adaptfully.get('analytics');
analytics.setContext({ channel: 'web' });
analytics.identify(accountId); // opaque id only — no emails
analytics.track('game_start', { mapId: 28, players: 1 });
analytics.optOut(); // persists via storage when registered
```

Games should call `adaptfully.has('analytics')` before `get` during rollout if older builds may omit the registration. Prefer named product events over fake page paths. Do not branch on Steam vs Capacitor for delivery — the HTTP plugin works across shells.

### Auth plugins

| Plugin key | Registration | Runtime |
|------------|--------------|---------|
| `google-auth` | `adaptfully.register('auth', adaptfully.auth.Google)` | Web, Android, iOS |
| `steam-auth` | `adaptfully.register('auth', adaptfully.auth.Steam)` | Steam / Electron (via [steamworks.js](https://github.com/ceifa/steamworks.js)) |
| `social-auth` | `adaptfully.register('auth', adaptfully.auth.Social)` | Capacitor (via [@capgo/capacitor-social-login](https://github.com/Cap-go/capacitor-social-login)) |
| `dev-auth` | `adaptfully.register('auth', adaptfully.auth.Dev)` | Local / testing |

Use plugin keys in `config.platforms.<platform>.registrations`. Custom deploy scripts use a path relative to the deploy folder instead:

```json
{
  "config": {
    "platforms": {
      "steam": {
        "registrations": {
          "storage": "localStorage",
          "auth": "steam-auth"
        }
      },
      "web": {
        "registrations": {
          "storage": "localStorage",
          "auth": "google-auth"
        }
      },
      "dev": {
        "registrations": {
          "storage": "localStorage",
          "auth": "dev-auth"
        }
      }
    }
  }
}
```

Standard plugin keys load bundled Adaptfully runtime scripts and emit an inline `adaptfully.register()` call. Path values add a `<script src="...">` tag — the script is expected to call `adaptfully.register()` itself (for example a bridge that wires `storage` and `config`). Use a leading `/` for site-root URLs; omit it for paths relative to each HTML page (required when the game is hosted in a subdirectory).

Wrapfully builders (`steam`, `win`, `mac`, `android`, etc.) map to platform keys via defaults (`win` → `steam`) or an explicit `builders` array on the platform config.

Each platform entry may set a **`packager`** (`web`, `electron`, `cordova`, or `capacitor`). Defaults to **`web`** — copy deploy and inject HTML only. Packagers are implemented as classes (`WebPackager`, `ElectronPackager`, `CordovaPackager`, `CapacitorPackager`) that handle prebuild output for their target platforms.

| Packager | Prebuild adds |
|----------|---------------|
| `web` | `game-config.js` for **`uwp`** platform prebuilds |
| `electron` | `main.js` (Electron shell); `preload.js` when **`steam-auth`** is registered |
| `cordova` | `cordova.js` stub, `game-config.js`, CSP/viewport HTML extras |
| `capacitor` | `game-config.js`, Capacitor CSP/viewport; `social-login-config.js` when **`social-auth`** is registered |

Android/iOS Wrapfully builds default to the **`capacitor`** builder family. Set `packager: "cordova"` on a platform to use Cordova for that target.

**`steam-auth` requires `packager: "electron"`** and `platforms.<name>.steamId` (Steamworks app ID for the client preload). Steam **upload** app IDs live separately in each Steam deployment’s `manifest.json` — see Wrapfully docs.

**`social-auth` requires `packager: "capacitor"`** and `platforms.<name>.socialLogin` (Capgo provider client IDs). Wrapfully installs `@capgo/capacitor-social-login` when building.

```json
{
  "config": {
    "platforms": {
      "web": {
        "packager": "web",
        "registrations": { "auth": "google-auth" }
      },
      "steam": {
        "packager": "electron",
        "steamId": 1234567,
        "registrations": { "auth": "steam-auth" }
      },
      "android": {
        "packager": "capacitor",
        "registrations": { "auth": "social-auth", "storage": "localStorage" },
        "socialLogin": {
          "providers": { "google": true, "apple": true },
          "google": {
            "webClientId": "….apps.googleusercontent.com",
            "iOSClientId": "….apps.googleusercontent.com"
          },
          "apple": {
            "clientId": "com.example.service"
          }
        }
      }
    }
  }
}
```

#### Steam auth (`steam-auth`)

When `steam-auth` is registered on an **`electron`** platform, Adaptfully prebuild writes:

- **`main.js`** — Electron shell with Steam overlay enabled and a preload script wired in
- **`preload.js`** — initializes [steamworks.js](https://github.com/ceifa/steamworks.js) with `platforms.<name>.steamId` and exposes `window.__ADAPTFULLY_STEAMWORKS__`

The renderer `steam-auth` plugin reads the Steam ID from that bridge. When Steam is available, `autoLogin()` succeeds immediately with `{ id: steamId64, email: '' }`. `supportsLogout()` is `false` and `requiresEmail()` is `false` — games should not offer Sign out, and should treat id-only identity as complete. Optional config keys:

| Key | Default | Purpose |
|-----|---------|---------|
| `autoLoginStorageKey` | `lastLoggedIn` | Storage key written with the Steam ID on login |
| `steamReadyTimeoutMs` | `10000` | Max wait when a bridge exists but identity is not yet ready |

#### Social auth (`social-auth`)

When `social-auth` is registered on a **`capacitor`** platform, Adaptfully prebuild writes **`social-login-config.js`** (`window.__ADAPTFULLY_SOCIAL_LOGIN__`) from `platforms.<name>.socialLogin`. Wrapfully installs [`@capgo/capacitor-social-login`](https://github.com/Cap-go/capacitor-social-login) and syncs it into the native project (same role as `steamworks.js` for Electron).

The runtime plugin calls Capgo `SocialLogin.initialize` / `login` / `logout` / `isLoggedIn`. Default provider is `google` on Android and `apple` on iOS when both are enabled (override with `socialLogin.defaultProvider`).

**Apple-only iOS** (`providers.google: false`, `providers.apple: true`) is supported — Google `webClientId` is not required. On iOS, if `apple.clientId` is omitted, Adaptfully defaults it to the platform `packageName` (Capgo uses this as a plugin label on native iOS, not an Apple Services ID). On Android, Apple Sign-In still requires `apple.clientId`. At runtime, an empty Apple `clientId` also falls back to `window.gameConfig.packageName`.

Optional config keys:

| Key | Default | Purpose |
|-----|---------|---------|
| `autoLoginStorageKey` | `lastLoggedIn` | Storage key written with the user id on login |
| `socialReadyTimeoutMs` | `10000` | Max wait for the Capgo plugin bridge |

### Node API

```javascript
import {
    prebuildPlatform,
    createPackagerForPlatform,
    resolveHtmlInjections,
    runAdaptfullyStage,
    buildAdaptfullyInjection,
    injectAdaptfullyRegistrations,
    adaptfullyInjectionForPlatform,
    resolveRegistrationAssets,
    resolvePlatformKey,
    resolveBuilderForPlatform,
    getRuntimeDir,
    resolveRuntimeScript,
    STANDARD_PLUGINS,
} from '@makefully/adaptfully';
```

- **`prebuildPlatform(deployFolder, platformKey, pkg)`** — copy `deploy/` to `output/<platform>-prebuild/` and inject registrations into `config.htmlInjections` (default: `index.html`).
- **`createPackagerForPlatform(platformKey, pkg, { platforms, log })`** — get a packager instance for custom prebuild or future build/deploy integration. The instance exposes `usesPlugin('steam-auth')`, `collectUsedPlugins()`, and `prebuild(dest, htmlPaths)`.
- **`resolveRegistrationAssets(registrations)`** — resolve runtime script paths, inline registration JS, and external script tags for a registration map (useful for Vite dev servers).
- **`runAdaptfullyStage('prebuild' | 'build' | 'deploy', platformKey, options)`** — run a pipeline stage programmatically.
- **`platform.autoLogin(callback)`** — restore a prior session without UI when the auth plugin supports it (Google uses `lastLoggedIn` in storage and a cached OAuth token).
- **`platform.supportsAutoLogin()`** — whether the active auth plugin can attempt automatic sign-in.
- **`platform.logout(callback)`** — clear / revoke the platform session when supported.
- **`platform.supportsLogout()`** — whether logout is a durable user-facing action. Steam returns `false` (identity is bound to the Steam client); Google, social, and dev return `true`. Prefer this over checking `auth.name` when showing Sign out UI.
- **`platform.requiresEmail()`** — whether `getUser()` must include email for a complete session. Steam returns `false` (SteamID64 alone); Google, social, and dev return `true`. Prefer this over checking `auth.name` for session sync and account-link routing.

---

## Wrapfully deploy

After prebuild, the build and deploy stages zip `output/<platform>-prebuild/` and POST it to a Wrapfully build server. Artifacts are saved to `./output/`.

## Quick start

1. Build your web app into a neutral deploy folder (default: `./deploy/`, must include `index.html` with adaptfully markers).
2. Add `config.platforms` and other settings to `package.json` (see [Configuration](#configuration)).
3. Add icons and any signing credentials under `./assets/meta/`.
4. Prebuild for your target platform, then build or deploy:

```bash
npx adaptfully prebuild web
npx adaptfully deploy steam http://build.example.com:9633/
```

For web-only hosting (no Wrapfully), stop after prebuild and upload `output/web-prebuild/` yourself.

## Usage

### Adaptfully CLI

Run from your project root:

```bash
npx adaptfully <prebuild|build|deploy|release> <platform> [server] [mode]
npx adaptfully steam-publish [--username U] [--password P] [--deployment steam] [--output path]
npx adaptfully google-publish [--from service-account.json] [--deployment android] [--output path]
npx adaptfully apple-publish [--deployment ios] [--category C] [--identity I] [--username U] [--password P]
```

| Stage | Description |
|-------|-------------|
| `prebuild` | Copy `deploy/` → `output/<platform>-prebuild/` with registrations injected into `config.htmlInjections` |
| `build` | Prebuild, then POST to Wrapfully (no platform release) |
| `deploy` | Prebuild, POST to Wrapfully, then release when credentials are present |

| Argument | Default | Description |
|----------|---------|-------------|
| `platform` | — | Platform key from `config.platforms` (`web`, `steam`, etc.) |
| `server` | see below | Wrapfully server base URL (`build` and `deploy` only) |
| `mode` | `extract` | `extract` unpacks the response zip into `./output/`; any other value saves `./output/{name}-{version}-{builder}.zip` |

Examples:

```bash
# Prebuild for web (upload output/web-prebuild/ via FTP, S3, etc.)
npx adaptfully prebuild web

# Build for Steam via Wrapfully
npx adaptfully build steam http://build.example.com:9633/

# Full Steam deploy (build + upload when steam.json credentials are present)
npx adaptfully deploy steam http://build.example.com:9633/
```

Add scripts to your project's `package.json`:

```json
{
  "scripts": {
    "web:prebuild": "adaptfully prebuild web",
    "steam:deploy": "adaptfully deploy steam"
  }
}
```

### wrapfully-deploy (legacy alias)

```bash
npx wrapfully-deploy [builder] [server] [mode]
```

Accepts Wrapfully builder names (`steam`, `win`, `mac`, `android`, `webapp`, etc.) instead of platform keys. Maps to the matching `config.platforms` entry (defaults: `win` → `steam`, `webapp` → `web`) and runs the `deploy` stage.

### Server address

The server URL is resolved in this order:

1. CLI argument
2. `WRAPFULLY_SERVER` environment variable
3. `server` field in `wrapfully.json`
4. `http://localhost:9633/`

Keep server addresses and credentials out of version control — use environment variables or a gitignored `wrapfully.json`.

## What gets sent

The client POSTs a zip stream built from `output/<platform>-prebuild/` to:

```
{server}{builder}/{name}-{version}
```

For example, a project named `mygame` at version `1.2.0` with builder `android`:

```
http://build.example.com:9633/android/mygame-1.2.0
```

The server extracts the zip, reads the embedded `package.json`, runs the build for that platform, and streams a zip of artifacts back to the client.

### Zip contents

| Archive path | Source on disk | Purpose |
|--------------|----------------|---------|
| `deploy/` | prebuilt `output/<platform>-prebuild/` | Built web app with Adaptfully registrations injected |
| `deploy/index.html` | prebuilt entry point | Platform-specific HTML |
| `meta/` | `./assets/meta/` (if present) | Icons, signing keys, and publish credentials |
| `package.json` | project root | Merged `package.json` + `wrapfully.json` config |

### Project layout

```
mygame/
├── package.json          # npm metadata + config.platforms (see below)
├── wrapfully.json        # optional — merged into config
├── deploy/               # neutral build output (default deployFolder)
│   └── index.html
├── output/
│   ├── web-prebuild/     # after adaptfully prebuild web
│   └── steam-prebuild/   # after adaptfully prebuild steam
└── assets/
    └── meta/                    # shared files packaged as meta/ in the zip
        ├── icon-foreground.png
        ├── icon-background.png
        └── deployments/         # one folder per deployment target (creds)
            ├── web-testing/
            │   └── sftp.json
            ├── web-prod/
            │   └── sftp.json
            └── steam/           # default deployment for the `steam` platform
                └── steam.json
```

The selected deployment's folder is shipped as `meta/publish/` in the zip, so per-platform credential file names (`build.json`, `sftp.json`, `steam.json`, `apple.json`, `google.json`, `ms.json`, `android/`, `ms/`) live inside `assets/meta/deployments/<key>/`.

Icons (`icon-foreground.png`, `icon-background.png`) are required for mobile, desktop, and Steam builds. If either file is missing from `assets/meta/`, Adaptfully **warns** and ships packaged placeholder icons for that build so Wrapfully can still run.

### Icons

Place two layered PNG files in `./assets/meta/` (packaged as `meta/` in the zip):

| File | Purpose |
|------|---------|
| `icon-foreground.png` | Foreground layer (typically the character or subject) |
| `icon-background.png` | Background layer (typically the scene or environment) |

The build server composites the foreground over the background, applies a binding/logo overlay, and generates the icon sizes each platform needs.

**Recommended format:** 1536×1536 pixel square PNGs for both files. Images with other dimensions are scaled to 1536×1536 automatically, but matching the target size produces the sharpest results.

Missing icons do not fail the Adaptfully client: check the `WARNING missing layered icon(s)` log line and replace the placeholders before a store release.

## Configuration

Build settings are read from `package.json`. The client merges any `wrapfully.json` fields into `package.json`'s `config` object before sending.

### `package.json`

Standard npm fields (`name`, `version`, `description`) are used directly. Add a `config` block:

```json
{
  "name": "mygame",
  "version": "1.2.0",
  "description": "My game",
  "config": {
    "title": "My Game",
    "packageName": "com.example.mygame",
    "publisherDisplayName": "Example Games",
    "publisherFullName": "Example Games LLC",
    "publisherWebsite": "https://example.com",
    "publisherEmailAddress": "hello@example.com",
    "scope": "https://example.com/games/",
    "themeColor": "#1a1a2e",
    "twitterId": "@examplegames",
    "deployFolder": "deploy",
    "platforms": {
      "web": {
        "registrations": {
          "auth": "google-auth",
          "storage": "javascript/adaptfully-bridge.js"
        }
      },
      "steam": {
        "packager": "electron",
        "steamId": 1234567,
        "registrations": {
          "auth": "steam-auth",
          "storage": "javascript/adaptfully-bridge.js"
        }
      }
    },
    "properties": [
      { "tag": "plugin", "name": "cordova-plugin-inappbrowser" },
      { "tag": "allow-navigation", "href": "*" }
    ]
  }
}
```

| Field | Used by | Description |
|-------|---------|-------------|
| `title` | All | Display name shown in stores and app shells |
| `packageName` | Cordova, Capacitor, Electron, UWP, Play upload | Reverse-DNS identifier (`com.company.game`) |
| `publisherDisplayName` | Cordova, Electron, web | Short publisher name |
| `publisherFullName` | Electron | Legal entity name for copyright |
| `publisherWebsite` | Cordova, web | Company URL |
| `publisherEmailAddress` | Cordova | Contact email |
| `scope` | Web/PWA | Base URL scope for the web app |
| `themeColor` | Cordova, Capacitor, Electron, UWP, web | Loading screen / theme color |
| `twitterId` | Web | Twitter handle for meta tags |
| `deployFolder` | Client | Neutral deploy directory staged before prebuild (default: `deploy`) |
| `htmlInjections` | Prebuild | Deploy-relative HTML paths to inject (default: `["index.html"]`) |
| `outputFolder` | Client | Prebuild output root (default: `output`) |
| `platforms` | Prebuild | Per-platform registration maps (see [Adaptfully runtime](#adaptfully-runtime)) |
| `platforms.<name>.builder` | Build/deploy | Override Wrapfully builder for a platform (default: `web` → `webapp`, others match platform key) |
| `platforms.<name>.builders` | wrapfully-deploy | Map additional Wrapfully builder names to a platform |
| `platforms.<name>.packager` | Prebuild | `web` (default), `electron`, `cordova`, or `capacitor` — selects the packager class that adds platform-specific files during prebuild |
| `platforms.<name>.steamId` | Electron + steam-auth | Steamworks app ID baked into `preload.js` (client). Upload app IDs belong in the Steam deployment `manifest.json` |
| `platforms.<name>.socialLogin` | Capacitor + social-auth | Capgo provider config (`providers`, `google.webClientId`, `apple.clientId`, optional `defaultProvider`) |
| `platforms.<name>.<configField>` | Build/deploy | Overrides the matching top-level `config.*` default for that platform only (e.g. `platforms.android.packageName`, `platforms.ios.title`). Does not apply to control fields: `packager`, `registrations`, `builder`, `builders`, `deployments`, `steamId`, `socialLogin`, `steamworks` |
| `properties` | Cordova | Cordova config.xml entries (plugins, allow-navigation, etc.) |

Top-level `config.*` values are **defaults**. Any non-control field on `config.platforms.<name>` overrides the default when that platform is built or deployed. Example:

```json
"config": {
  "packageName": "com.example.game",
  "title": "My Game",
  "platforms": {
    "android": {
      "packager": "capacitor",
      "packageName": "com.example.game.android"
    },
    "android-dev": {
      "packager": "capacitor",
      "packageName": "com.example.game.dev"
    }
  }
}
```


### `wrapfully.json`

Optional. Fields are shallow-merged into `package.json`'s `config`:

```json
{
  "deployFolder": "dist",
  "server": "http://build.example.com:9633/",
  "title": "My Game",
  "packageName": "com.example.mygame"
}
```

Use this to set the server address or override config per environment without editing `package.json`.

## Builders

Each builder name becomes a path segment on the server. Some builds require a specific host OS on the server side; composite builders fan out to multiple platforms automatically.

| Builder | Output |
|---------|--------|
| `android` | Release Android (.aab) |
| `android-dev` | Debug Android (.apk) |
| `ios` | Release iOS (.ipa) |
| `ios-dev` | Debug iOS (.ipa) |
| `ios-sim` | iOS Simulator (.app) |
| `mac` | Release Mac (.app) |
| `mac-dev` | Debug Mac (.app) with DevTools |
| `win` | Windows portable (.exe) |
| `win-dev` | Debug Windows portable with DevTools |
| `linux` | Linux build |
| `linux-dev` | Debug Linux build with DevTools |
| `uwp` | Universal Windows Package |
| `webapp` | Service-worker web app (optionally SFTP deploy) |
| `steam` | Windows + Mac + Linux, uploads to Steam |
| `steam-dev` | Debug Windows + Mac + Linux, no Steam upload |

For a single platform, pass the specific builder name.

### Platform package requirements

Signing keys, provisioning profiles, and store credentials go in the deployment folder `./assets/meta/deployments/<deployment>/` on disk (the selected deployment is sent as `meta/publish/` in the zip). The examples below use `<deployment>` as a placeholder for the target key (e.g. `steam`, `web-prod`). **These files contain secrets** — add them to `.gitignore` and never commit them to a public repository. (Projects that have not adopted the `deployments/` layout may still place these under the legacy `./assets/meta/publish/`.)

#### Android (`android`, `android-dev`)

Place keystore files in `assets/meta/deployments/<deployment>/android/`. Include `assets/meta/deployments/<deployment>/build.json`:

```json
{
  "android": {
    "debug": {
      "keystore": "./android/debug.keystore",
      "packageType": "apk",
      "storePassword": "android",
      "alias": "androiddebugkey",
      "password": "android",
      "keystoreType": ""
    },
    "release": {
      "keystore": "./android/release.keystore",
      "packageType": "bundle",
      "storePassword": "(your store password)",
      "alias": "(your alias)",
      "password": "(your password)",
      "keystoreType": ""
    }
  }
}
```

To deploy to Google Play, also include `assets/meta/deployments/<deployment>/google.json`. The easiest path is:

```bash
npx adaptfully google-publish --from ./path/to/play-service-account.json
# defaults to assets/meta/deployments/android/google.json (+ manifest type "google")
```

The file looks like:

```json
{
  "type": "service_account",
  "project_id": "(your project id)",
  "private_key_id": "(your private key id)",
  "private_key": "(your private key)",
  "client_email": "(your service account email)",
  "client_id": "(your client id)",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "(your service account cert URL)"
}
```

#### Apple (`ios`, `ios-dev`, `ios-sim`, `mac`)

**Capacitor iOS** signing is file-based under the deployment folder (not the Cordova-style `build.json` `ios.*` identity fields):

```
assets/meta/deployments/<deployment>/
  apple.json
  apple/distribution.p12              # release
  apple/app-store.mobileprovision     # release
  apple/development.p12               # ios-dev device
  apple/development.mobileprovision   # ios-dev device
```

The `.p12` passphrase must match `MAC_KEYCHAIN_PASSWORD` on the Mac Wrapfully host. Team ID and profile UUID are read from the `.mobileprovision`. Enable **Sign in with Apple** on the App ID when using Capgo Apple auth.

Optional `build.json` may still be present for tooling compatibility; Capacitor does not require its `ios.*` code-sign fields.

To deploy to the App Store, include `assets/meta/deployments/<deployment>/apple.json`. The easiest path is:

```bash
npx adaptfully apple-publish
# defaults to assets/meta/deployments/ios/apple.json (+ manifest type "apple")
```

The file looks like:

```json
{
  "category": "public.app-category.games",
  "identity": "(your team id)",
  "username": "(Apple ID email)",
  "password": "(app-specific password)"
}
```

iOS IPA upload uses `username` + `password` via `xcrun altool --upload-app`. `category` / `identity` matter more for macOS Electron signing/notarization.
#### Cordova

Set `packager: "cordova"` on an `android` or `ios` platform to use Cordova instead of Capacitor. Requires the Android and Apple package requirements above.

#### Steam (`steam`, `steam-dev`)

`steam-dev` builds debug Electron binaries for Windows, Mac, and Linux without uploading to Steam. No `steam.json` credentials are required.

For release uploads, run **`adaptfully steam-publish`** once on your machine. It installs steamcmd if needed, logs you in interactively (enter a Steam Guard code if prompted), and writes `assets/meta/deployments/steam/steam.json`:

```json
{
  "username": "(your Steam build account)",
  "password": "(your password)",
  "configVdf": "(base64 login token from steamcmd)",
  "sentryFileName": "(only when Steam Guard is enabled)",
  "sentryFile": "(base64 ssfn file — only when Steam Guard is enabled)"
}
```

Accounts **without** Steam Guard only need `username`, `password`, and `configVdf`. Accounts **with** Steam Guard also include the `ssfn` sentry file so the Wrapfully server can log in without a live 2FA prompt.

Re-run `adaptfully steam-publish` if Steam invalidates the token (new machine, password change, or expired guard).

For Steamworks / `steam-auth` client builds, set `platforms.<name>.steamId`. For Steam **uploads**, set `steamId` on the deployment’s `manifest.json` (see Wrapfully). Those are independent: you can deploy without steam-auth, or use steam-auth without uploading.

Steam builds can run on either the Windows or Mac server. The server that receives the request builds its own platforms and requests the rest from the other server (Windows builds `win` and requests `mac`/`linux`; Mac builds `mac`/`linux` and requests `win`). Install the Steamworks SDK ContentBuilder on any server that will upload to Steam.

When builds relay between servers, `meta/publish/` credentials travel in the zip with the game payload.

#### Electron (`win`, `win-dev`, `mac`, `mac-dev`, `linux`, `linux-dev`, `steam`, `steam-dev`)

`-dev` builders produce debug Electron apps with DevTools enabled and the application menu visible. Dev builds skip code signing, notarization, and Steam upload. No publish credentials are required for dev builds.

Release `win` builds can be signed with `assets/meta/deployments/<deployment>/ms.json` (see Windows below). Release `mac` builds can use `assets/meta/deployments/<deployment>/apple.json` for signing and notarization (see Apple above).

#### Web (`web` / `webapp`)

`adaptfully deploy web` prebuilds and POSTs to the Wrapfully **`webapp`** builder (same conduit as Steam). Put an `sftp.json` in each web deployment folder (e.g. `assets/meta/deployments/web-prod/sftp.json`); the selected deployment is zipped as `meta/publish/sftp.json` for Wrapfully to deploy via SFTP. The inner key stays the builder name (`webapp`).

```json
{
  "webapp": {
    "host": "(your sftp host)",
    "port": 22,
    "username": "(your username)",
    "password": "(your password)",
    "path": "/home/user/example.com.incoming",
    "uploadMode": "direct",
    "serviceWorker": false,
    "metaWeb": false,
    "cleanRemote": false
  }
}
```

See [Wrapfully README](https://github.com/Makefully-Studios/wrapfully-client) for `uploadMode`, `serviceWorker`, `metaWeb`, and `cleanRemote`.

#### Windows (`win`, `win-dev`, `uwp`)

To sign the app, place your certificate at `assets/meta/deployments/<deployment>/ms/packcert.pfx` and include `assets/meta/deployments/<deployment>/ms.json`:

```json
{
  "publisherName": "CN=(your publisher id)",
  "certificateFile": "./ms/packcert.pfx",
  "password": "(your password)"
}
```

## Response

The server responds with a zip stream containing build artifacts (`.apk`, `.aab`, `.ipa`, `.app`, `.exe`, etc.) and optional status files. By default the client extracts this into `./output/`. Use a non-`extract` mode value to save the raw response zip instead.

Every build also includes `wrapfully-status.json` with structured `success`, `warn`, and `error` events. The client prints these after extraction and exits with code 1 if any errors were reported, so build failures do not crash the server silently.

## License

MIT
