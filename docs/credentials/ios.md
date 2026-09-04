# iOS credentials

Set up Apple signing files and (for App Store uploads) App Store Connect login credentials.

**Default folder:** `assets/meta/deployments/ios/`

You can create signing material on **macOS or Windows**. The sections below branch where the local tools differ.

## Recommended path

1. **Helper:** `npx adaptfully apple-signing --kind development` (and/or `--kind distribution`) — generates a CSR, walks portal checklist, exports `.p12`, optionally copies the provisioning profile.
2. Complete the Apple Developer portal steps the helper prints (upload CSR, download `.cer` / `.mobileprovision`).
3. For App Store uploads only — **Helper:** `npx adaptfully apple-publish` — writes `apple.json`.

Simulator builds (`ios-sim`) need no device signing files.

## What you need

| Goal | Files |
|------|--------|
| Device debug (`ios-dev`) | `apple/development.p12`, `apple/development.mobileprovision` |
| App Store (`ios` release) | `apple/distribution.p12`, `apple/app-store.mobileprovision`, `apple.json` |
| Simulator (`ios-sim`) | None |

Optional `build.json` next to `apple/`:

```json
{
  "apple": {
    "p12Password": "(passphrase used when exporting the .p12)"
  }
}
```

If omitted, the build pipeline treats the passphrase as empty.

## Prerequisites

- Apple Developer Program membership.
- An App ID matching your platform `packageName`.
- If you use Capgo Apple social login: enable **Sign in with Apple** on that App ID.
- For development profiles: registered device UDIDs.
- OpenSSL on PATH for the helper / Windows manual path (`openssl version`). macOS Keychain users can still use the helper if OpenSSL is available (e.g. via Homebrew or Xcode CLT tooling).

## Full steps

### 1. Helper: CSR, `.p12`, and profile placement

**Helper:** `npx adaptfully apple-signing [--kind development|distribution] [--csr-only] [--from-cer path] [--provision path] [--p12-password secret]`

If you run the full interactive helper (not `--csr-only`), **skip to step 7** after it finishes (or step 8 for App Store Connect login).

Useful flags:

- `--csr-only` — stop after writing the CSR; later continue with `--from-cer`
- `--from-cer ./Certificates.cer` — skip CSR generation when `apple/.work/private.key` already exists
- `--provision ./Profile.mobileprovision` — copy/rename into `apple/`
- `--kind development` or `--kind distribution`

Work files live under `assets/meta/deployments/ios/apple/.work/` by default (`private.key` + CSR).

### 2. Create a Certificate Signing Request (manual)

Skip this if you used step 1 (or will use `--from-cer` with an existing key from step 1).

#### macOS (Keychain Access)

1. Open **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority…**
2. Enter your email and common name; choose **Saved to disk**.
3. Save the `.certSigningRequest` file.

#### Windows / OpenSSL (any OS)

```bash
mkdir -p assets/meta/deployments/ios/apple/.work
cd assets/meta/deployments/ios/apple/.work

openssl genrsa -out private.key 2048
openssl req -new -key private.key -out CertificateSigningRequest.certSigningRequest -subj "/emailAddress=you@example.com/CN=Your Name/C=US"
```

### 3. Create the certificate on the Apple Developer site (manual)

Always required — Apple must issue the certificate.

1. Open [Certificates](https://developer.apple.com/account/resources/certificates/list).
2. Create **Apple Development** (device debug) and/or **Apple Distribution** (App Store).
3. Upload the CSR from step 1 or 2.
4. Download the `.cer` file.

### 4. Export a `.p12` (manual)

Skip this if step 1 already exported `development.p12` / `distribution.p12`.

#### macOS (Keychain Access)

1. Double-click the `.cer` to import it into Keychain Access.
2. Find the certificate (and its private key) → **Export…** → `.p12`.
3. Choose a passphrase; remember it for `build.json` `apple.p12Password`.
4. Save as `assets/meta/deployments/ios/apple/development.p12` or `distribution.p12`.

#### Windows / OpenSSL

```bash
# From the folder that has private.key and the downloaded .cer
openssl x509 -in Certificates.cer -inform DER -out cert.pem -outform PEM
openssl pkcs12 -export -inkey private.key -in cert.pem -out development.p12
# or distribution.p12 — use the matching kind
```

Move the `.p12` to `assets/meta/deployments/ios/apple/`.

If DER conversion fails, try importing the `.cer` as PEM directly in the `pkcs12 -export` `-in` argument.

### 5. Create and download a provisioning profile (manual)

Always required for device / App Store signing.

1. Register devices (development) under [Devices](https://developer.apple.com/account/resources/devices/list).
2. Open [Profiles](https://developer.apple.com/account/resources/profiles/list).
3. Create a **Development** profile or **App Store** profile for your App ID and certificate.
4. Download the `.mobileprovision`.

### 6. Place the provisioning profile (manual)

Skip this if step 1 copied it with `--provision`.

Rename/copy to:

- Development → `assets/meta/deployments/ios/apple/development.mobileprovision`
- App Store → `assets/meta/deployments/ios/apple/app-store.mobileprovision`

### 7. Optional: record the `.p12` passphrase

Skip this if `apple-signing` already wrote `build.json`.

Create or merge `assets/meta/deployments/ios/build.json`:

```json
{
  "apple": {
    "p12Password": "(your .p12 passphrase)"
  }
}
```

### 8. Helper: App Store Connect login (`apple.json`)

Required only for App Store uploads.

**Helper:** `npx adaptfully apple-publish [--deployment ios]`

If you run this, **skip to step 10**.

You need an [app-specific password](https://appleid.apple.com/) for your Apple ID.

### 9. Manual alternative: write `apple.json`

Skip this if you used step 8.

```json
{
  "category": "public.app-category.games",
  "identity": "(your team id)",
  "username": "(Apple ID email)",
  "password": "(app-specific password)"
}
```

### 10. Done when

- [ ] For `ios-dev`: `apple/development.p12` + `apple/development.mobileprovision`
- [ ] For App Store: `apple/distribution.p12` + `apple/app-store.mobileprovision` + `apple.json`
- [ ] `apple.p12Password` matches the `.p12` passphrase when the passphrase is non-empty
- [ ] App ID matches `packageName`; Sign in with Apple enabled if you use Capgo Apple auth
- [ ] Credential paths are gitignored

## Notes

- Filenames under `apple/` must match the table above.
- You can create credentials on Windows even if the IPA is built elsewhere.
- Re-run `apple-signing --kind …` separately for development and distribution when you need both.
