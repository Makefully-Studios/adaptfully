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
adaptfully prebuild web     # deploy/ → output/web-prebuild/
adaptfully build steam      # prebuild + zip and send to Wrapfully
adaptfully deploy steam     # build + platform release when credentials are present
```

| Stage | What it does |
|-------|----------------|
| `prebuild` | Copy `deploy/` to `output/<platform>-prebuild/` and inject registrations |
| `build` | Prebuild, then POST the result to Wrapfully |
| `deploy` | Build, then release to the target platform (Steam upload, webapp SFTP, etc. via Wrapfully when credentials are in `assets/meta/publish/`) |

`wrapfully-deploy` is a compatibility alias for `adaptfully deploy` when invoked with a Wrapfully builder name (`steam`, `win`, `android`, etc.).

Place `<!-- adaptfully -->` / `<!-- /adaptfully -->` markers in your HTML templates where registrations should be injected (typically between split bundle scripts, before `account.js` runs).

```javascript
// Injected into deploy/index.html for the target platform (before game code):
adaptfully.register('auth', adaptfully.auth.Google);

// In-game:
var platform = adaptfully.get('auth');
platform.login(function (result) { /* ... */ });
```

### Auth plugins

| Plugin key | Registration | Runtime |
|------------|--------------|---------|
| `google-auth` | `adaptfully.register('auth', adaptfully.auth.Google)` | Web, Android, iOS |
| `steam-auth` | `adaptfully.register('auth', adaptfully.auth.Steam)` | Steam / Electron |
| `dev-auth` | `adaptfully.register('auth', adaptfully.auth.Dev)` | Local dev (test user) |

Use plugin keys in `config.platforms.<platform>.registrations`. Custom deploy scripts use a path relative to the deploy folder instead:

```json
{
  "config": {
    "platforms": {
      "steam": {
        "registrations": {
          "auth": "steam-auth",
          "storage": "/javascript/custom-storage-solution.js"
        }
      },
      "web": {
        "registrations": {
          "auth": "google-auth",
          "storage": "/javascript/adaptfully-bridge.js"
        }
      },
      "dev": {
        "registrations": {
          "auth": "dev-auth"
        }
      }
    }
  }
}
```

Standard plugin keys load bundled Adaptfully runtime scripts and emit an inline `adaptfully.register()` call. Path values add a `<script src="...">` tag — the script is expected to call `adaptfully.register()` itself (for example a bridge that wires `storage` and `config`).

Wrapfully builders (`steam`, `win`, `mac`, `android`, etc.) map to platform keys via defaults (`win` → `steam`) or an explicit `builders` array on the platform config.

### Node API

```javascript
import {
    prebuildPlatform,
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

- **`prebuildPlatform(deployFolder, platformKey, pkg)`** — copy `deploy/` to `output/<platform>-prebuild/` and inject registrations into all HTML files.
- **`resolveRegistrationAssets(registrations)`** — resolve runtime script paths, inline registration JS, and external script tags for a registration map (useful for Vite dev servers).
- **`runAdaptfullyStage('prebuild' | 'build' | 'deploy', platformKey, options)`** — run a pipeline stage programmatically.

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
npx adaptfully deploy steam http://build.example.com:9630/
```

For web-only hosting (no Wrapfully), stop after prebuild and upload `output/web-prebuild/` yourself.

## Usage

### Adaptfully CLI

Run from your project root:

```bash
npx adaptfully <prebuild|build|deploy> <platform> [server] [mode]
```

| Stage | Description |
|-------|-------------|
| `prebuild` | Copy `deploy/` → `output/<platform>-prebuild/` with registrations injected |
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
npx adaptfully build steam http://build.example.com:9630/

# Full Steam deploy (build + upload when steam.json credentials are present)
npx adaptfully deploy steam http://build.example.com:9630/
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
4. `http://localhost:9630/`

Keep server addresses and credentials out of version control — use environment variables or a gitignored `wrapfully.json`.

## What gets sent

The client POSTs a zip stream built from `output/<platform>-prebuild/` to:

```
{server}{builder}/{name}-{version}
```

For example, a project named `mygame` at version `1.2.0` with builder `android`:

```
http://build.example.com:9630/android/mygame-1.2.0
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
    └── meta/             # packaged as meta/ in the zip
        ├── icon-foreground.png
        ├── icon-background.png
        └── publish/      # platform signing & deploy credentials
            ├── build.json
            ├── android/
            ├── apple.json
            └── ...
```

Icons (`icon-foreground.png`, `icon-background.png`) are required for mobile, desktop, and Steam builds.

### Icons

Place two layered PNG files in `./assets/meta/` (packaged as `meta/` in the zip):

| File | Purpose |
|------|---------|
| `icon-foreground.png` | Foreground layer (typically the character or subject) |
| `icon-background.png` | Background layer (typically the scene or environment) |

The build server composites the foreground over the background, applies a binding/logo overlay, and generates the icon sizes each platform needs.

**Recommended format:** 1536×1536 pixel square PNGs for both files. Images with other dimensions are scaled to 1536×1536 automatically, but matching the target size produces the sharpest results.

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
    "steamId": 1234567,
    "deployFolder": "deploy",
    "platforms": {
      "web": {
        "registrations": {
          "auth": "google-auth",
          "storage": "/javascript/adaptfully-bridge.js"
        }
      },
      "steam": {
        "registrations": {
          "auth": "steam-auth",
          "storage": "/javascript/adaptfully-bridge.js"
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
| `packageName` | Cordova, Electron, UWP | Reverse-DNS identifier (`com.company.game`) |
| `publisherDisplayName` | Cordova, Electron, web | Short publisher name |
| `publisherFullName` | Electron | Legal entity name for copyright |
| `publisherWebsite` | Cordova, web | Company URL |
| `publisherEmailAddress` | Cordova | Contact email |
| `scope` | Web/PWA | Base URL scope for the web app |
| `themeColor` | Cordova, UWP, web | Loading screen / theme color |
| `twitterId` | Web | Twitter handle for meta tags |
| `steamId` | Steam | Steam app ID |
| `deployFolder` | Client | Neutral deploy directory staged before prebuild (default: `deploy`) |
| `outputFolder` | Client | Prebuild output root (default: `output`) |
| `platforms` | Prebuild | Per-platform registration maps (see [Adaptfully runtime](#adaptfully-runtime)) |
| `platforms.<name>.builder` | Build/deploy | Override Wrapfully builder for a platform (default: `web` → `webapp`, others match platform key) |
| `platforms.<name>.builders` | wrapfully-deploy | Map additional Wrapfully builder names to a platform |
| `properties` | Cordova | Cordova config.xml entries (plugins, allow-navigation, etc.) |

### `wrapfully.json`

Optional. Fields are shallow-merged into `package.json`'s `config`:

```json
{
  "deployFolder": "dist",
  "server": "http://build.example.com:9630/",
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
| `cordova` | Release Android + iOS |
| `cordova-dev` | Debug Android + iOS |
| `apple` | Release Mac + iOS |
| `apple-dev` | Release Mac + debug iOS |

For a single platform, pass the specific builder name rather than a composite.

### Platform package requirements

Signing keys, provisioning profiles, and store credentials go in `./assets/meta/publish/` on disk (sent as `meta/publish/` in the zip). **These files contain secrets** — add them to `.gitignore` and never commit them to a public repository.

#### Android (`android`, `android-dev`)

Place keystore files in `assets/meta/publish/android/`. Include `assets/meta/publish/build.json`:

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

To deploy to Google Play, also include `assets/meta/publish/google.json`:

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

#### Apple (`ios`, `ios-dev`, `ios-sim`, `mac`, `apple`, `apple-dev`)

Include `assets/meta/publish/build.json` with iOS signing settings:

```json
{
  "ios": {
    "debug": {
      "codeSignIdentity": "iPhone Development",
      "provisioningProfile": "(your development provisioning profile id)",
      "developmentTeam": "(your team id)",
      "packageType": "development",
      "automaticProvisioning": false
    },
    "release": {
      "codeSignIdentity": "iPhone Distribution",
      "provisioningProfile": "(your distribution provisioning profile id)",
      "developmentTeam": "(your team id)",
      "packageType": "app-store",
      "automaticProvisioning": false
    }
  }
}
```

To deploy to the App Store, include `assets/meta/publish/apple.json`:

```json
{
  "category": "(your app's category)",
  "identity": "(your team identity)",
  "username": "(your username)",
  "password": "(your password)"
}
```

#### Cordova (`cordova`, `cordova-dev`)

Requires the Android and Apple package requirements above.

#### Steam (`steam`, `steam-dev`)

`steam-dev` builds debug Electron binaries for Windows, Mac, and Linux without uploading to Steam. No `steam.json` credentials are required.

For release uploads, include `assets/meta/publish/steam.json`:

```json
{
  "username": "(your username)",
  "password": "(your password)"
}
```

Also set `steamId` in your `config` block.

Steam builds can run on either the Windows or Mac server. The server that receives the request builds its own platforms and requests the rest from the other server (Windows builds `win` and requests `mac`/`linux`; Mac builds `mac`/`linux` and requests `win`). Install the Steamworks SDK ContentBuilder on any server that will upload to Steam.

When builds relay between servers, `meta/publish/` credentials travel in the zip with the game payload.

#### Electron (`win`, `win-dev`, `mac`, `mac-dev`, `linux`, `linux-dev`, `steam`, `steam-dev`)

`-dev` builders produce debug Electron apps with DevTools enabled and the application menu visible. Dev builds skip code signing, notarization, and Steam upload. No publish credentials are required for dev builds.

Release `win` builds can be signed with `assets/meta/publish/ms.json` (see Windows below). Release `mac` builds can use `assets/meta/publish/apple.json` for signing and notarization (see Apple above).

#### Web app (`webapp`)

To deploy via SFTP, include `assets/meta/publish/sftp.json`:

```json
{
  "webapp": {
    "host": "(your sftp host)",
    "port": 22,
    "user": "(your username)",
    "password": "(your password)",
    "path": "(the sftp subdirectory in which to publish the app)"
  }
}
```

#### Windows (`win`, `win-dev`, `uwp`)

To sign the app, place your certificate at `assets/meta/publish/ms/packcert.pfx` and include `assets/meta/publish/ms.json`:

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
