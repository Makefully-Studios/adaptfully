# Android credentials

Set up signing keystores and (for Play uploads) a Google Play service account.

**Default folder:** `assets/meta/deployments/android/`

## Recommended path

1. **Helper:** `npx adaptfully android-keystore` — creates debug + release keystores and `build.json`.
2. In Google Play Console, create a service account and download its JSON key (manual).
3. **Helper:** `npx adaptfully google-publish --from ./path/to/sa.json` — writes `google.json`.

Debug-only: `npx adaptfully android-keystore --debug-only`.

## What you need

| Goal | Files |
|------|--------|
| Debug / `android-dev` | `android/debug.keystore` + `build.json` `android.debug` block |
| Play release / `android` | `android/release.keystore` + `build.json` `android.release` + `google.json` |

`build.json` keystore paths are relative to the deployment folder (the directory that contains `build.json`).

## Full steps

### 1. Prerequisites

- JDK on PATH so `keytool` works (`keytool -help`).
- A Play Console app (for release uploads).

### 2. Helper: generate keystores

**Helper:** `npx adaptfully android-keystore [--deployment android] [--debug-only] [--yes]`

If you run this, **skip to step 5** (Play service account). For debug-only, you can stop after this step.

Flags:

- `--debug-only` — only the debug keystore + `build.json` debug block
- `--yes` — overwrite existing `build.json` without prompting
- `--alias`, `--store-password`, `--key-password`, `--cn` — non-interactive release keystore fields

### 3. Manual alternative: create keystores with keytool

Skip this if you used step 2.

```bash
mkdir -p assets/meta/deployments/android/android

keytool -genkeypair -v \
  -keystore assets/meta/deployments/android/android/debug.keystore \
  -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=Android Debug,O=Android,C=US"

keytool -genkeypair -v \
  -keystore assets/meta/deployments/android/android/release.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "(your store password)" -keypass "(your key password)" \
  -dname "CN=Your Studio,O=Your Studio,C=US"
```

### 4. Manual alternative: write `build.json`

Skip this if you used step 2.

Create `assets/meta/deployments/android/build.json`:

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
      "alias": "upload",
      "password": "(your key password)",
      "keystoreType": ""
    }
  }
}
```

### 5. Create a Play Console service account (manual)

Required only for Play uploads (`adaptfully release android` / deploy to Google).

1. Open [Google Play Console](https://play.google.com/console/) → **Setup** → **API access** (or Google Cloud IAM linked to the Play developer account).
2. Create or select a service account with permission to manage releases.
3. Download a JSON key for that service account.
4. Invite the service account email in Play Console with the right app permissions.

### 6. Helper: import `google.json`

**Helper:** `npx adaptfully google-publish --from ./path/to/service-account.json [--deployment android]`

If you run this, **skip to step 8**.

### 7. Manual alternative: copy the service account JSON

Skip this if you used step 6.

Copy the downloaded key to `assets/meta/deployments/android/google.json`. Ensure `manifest.json` includes `"type": "google"` (helpers write this for you).

### 8. Done when

- [ ] `build.json` exists with debug (and release, if shipping)
- [ ] Keystore files exist at the paths listed in `build.json`
- [ ] For Play uploads: `google.json` is present and the service account can access the app
- [ ] Credential paths are gitignored

## Notes

- Prefer **project-owned** keystores so debug installs stay reproducible across machines.
- Some build hosts supply a default debug keystore when `build.json` is missing; do not rely on that for shared projects.
- Keep release keystore passwords offline; losing the release keystore can block Play updates for that signing key.
