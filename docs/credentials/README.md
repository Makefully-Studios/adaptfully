# Credential setup guides

One-time local setup for signing and store-upload credentials under
`assets/meta/deployments/<deployment>/`.

These guides stay focused on **files in your game repo** and Adaptfully CLI helpers.
They do not cover which OS builds the artifact.

## Guides

| Platform | Guide | Typical deployment folder |
|----------|--------|---------------------------|
| iOS | [ios.md](./ios.md) | `assets/meta/deployments/ios/` |
| Android | [android.md](./android.md) | `assets/meta/deployments/android/` |
| Steam | [steam.md](./steam.md) | `assets/meta/deployments/steam/` |

## Helpers

| Command | Writes |
|---------|--------|
| `npx adaptfully android-keystore` | `android/*.keystore` + `build.json` |
| `npx adaptfully google-publish --from <sa.json>` | `google.json` |
| `npx adaptfully apple-signing` | CSR/key work files, `apple/*.p12`, optional `.mobileprovision` + `build.json` `apple.p12Password` |
| `npx adaptfully apple-publish` | `apple.json` (App Store Connect upload login) |
| `npx adaptfully steam-publish` | `steam.json` |

Each guide lists the **full manual process** and marks **Helper** steps with **skip to step N** when you use a command instead.

## Debug vs release

| Goal | Credentials needed? |
|------|---------------------|
| `android-dev` / local debug APK | Project debug keystore (recommended) or host default |
| `android` Play release | Release keystore + `google.json` |
| `ios-dev` device IPA | `development.p12` + `development.mobileprovision` |
| `ios` App Store | `distribution.p12` + `app-store.mobileprovision` + `apple.json` |
| `ios-sim` | No device signing files |
| `steam-dev` | None |
| `steam` upload | `steam.json` |

## Secrets

Do not commit credential files. Helpers update `.gitignore` with Adaptfully patterns such as:

- `assets/meta/deployments/**/build.json`
- `assets/meta/deployments/**/google.json`
- `assets/meta/deployments/**/apple.json`
- `assets/meta/deployments/**/steam.json`
- `assets/meta/deployments/**/android/`
- `assets/meta/deployments/**/apple/`
