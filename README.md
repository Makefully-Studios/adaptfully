# Adaptfully

Platform abstraction and Wrapfully deploy client for Makefully games.

- **Adaptfully runtime** — shared auth and platform services via `adaptfully.register()` / `adaptfully.get()`
- **Wrapfully deploy** — zip-and-post CLI for building desktop, mobile, and Steam packages

## Install

```bash
npm install @makefully/adaptfully
```

Maintainers: see [PUBLISHING.md](PUBLISHING.md) for npm trusted publishing setup.

## Adaptfully runtime

Games register platform services before load and retrieve them in-game. Auth is selected at **build time** by the game's build tooling — the game never chooses Google vs Steam directly.

```javascript
// Set by the build (before account.js loads):
adaptfully.register('auth', adaptfully.auth.Google);

// In-game:
var platform = adaptfully.get('auth');
platform.login(function (result) { /* ... */ });
```

### Auth plugins

| Plugin | Registration | Used for |
|--------|--------------|----------|
| `adaptfully.auth.Google` | `adaptfully.register('auth', adaptfully.auth.Google)` | Web, Android, iOS |
| `adaptfully.auth.Steam` | `adaptfully.register('auth', adaptfully.auth.Steam)` | Steam / Electron |
| `adaptfully.auth.Dev` | `adaptfully.register('auth', adaptfully.auth.Dev)` | Local dev (test user) |

Games can register shared dependencies before auth:

```javascript
adaptfully.register('storage', myStorage);
adaptfully.register('config', {
    googleClientId: '...',
    googleTokenKey: 'mygame_google_token',
    apiBase: 'https://api.example.com/',
});
```

### Node build helpers

```javascript
import {
    getAuthScriptsForChannel,
    authRegistrationScript,
    filterIncludesForBuildChannel,
    extScriptsForBuildChannel,
} from '@makefully/adaptfully';
```

`getAuthScriptsForChannel('web')` returns ordered runtime script paths. `authRegistrationScript('steam')` returns the inline registration snippet for that channel.

---

## Wrapfully deploy

Zips your web build and configuration, POSTs them to a Wrapfully build server, and saves the platform build artifacts it returns to `./output/`.

## Quick start

1. Build your web app into a deploy folder (default: `./deploy/`, must include `index.html`).
2. Add build configuration to `package.json` (see [Configuration](#configuration)).
3. Add icons and any signing credentials under `./assets/meta/`.
4. Deploy to your build server:

```bash
npx wrapfully-deploy android http://build.example.com:9630/
```

Build artifacts are written to `./output/`.

## Usage

Run from your project root:

```bash
npx wrapfully-deploy [builder] [server] [mode]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `builder` | `all` | Build target (see [Builders](#builders)). **Must be a valid builder name** — `all` is not a valid endpoint; always pass a platform. |
| `server` | see below | Base URL of the build server |
| `mode` | `extract` | `extract` unpacks the response zip into `./output/`; any other value saves `./output/{name}-{version}-{builder}.zip` |

Examples:

```bash
# Android release build
npx wrapfully-deploy android http://build.example.com:9630/

# Mac build using server from environment variable
export WRAPFULLY_SERVER=http://build.example.com:9630/
npx wrapfully-deploy mac

# Save the response as a zip instead of extracting
npx wrapfully-deploy win http://build.example.com:9630/ zip
```

Add scripts to your project's `package.json`:

```json
{
  "scripts": {
    "deploy:android": "wrapfully-deploy android",
    "deploy:mac": "wrapfully-deploy mac"
  }
}
```

Set `WRAPFULLY_SERVER` or a `server` field in `wrapfully.json` so scripts do not need the address on every invocation.

### Server address

The server URL is resolved in this order:

1. CLI argument
2. `WRAPFULLY_SERVER` environment variable
3. `server` field in `wrapfully.json`
4. `http://localhost:9630/`

Keep server addresses and credentials out of version control — use environment variables or a gitignored `wrapfully.json`.

## What gets sent

The client POSTs a zip stream to:

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
| `deploy/` | `{deployFolder}/` (default `./deploy/`) | Built web app (HTML, JS, assets) |
| `deploy/index.html` | `{deployFolder}/index.html` | Entry point (also included via the directory) |
| `meta/` | `./assets/meta/` (if present) | Icons, signing keys, and publish credentials |
| `package.json` | project root | Merged `package.json` + `wrapfully.json` config |

### Project layout

```
mygame/
├── package.json          # npm metadata + config block (see below)
├── wrapfully.json        # optional — merged into config
├── deploy/               # built web app (or set deployFolder in config)
│   └── index.html
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
| `properties` | Cordova | Cordova config.xml entries (plugins, allow-navigation, etc.) |
| `deployFolder` | Client | Deploy directory name (default: `deploy`) |

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
