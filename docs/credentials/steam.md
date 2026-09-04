# Steam credentials

Set up Steamworks upload login for release deploys. Debug Steam builds need no upload credentials.

**Default folder:** `assets/meta/deployments/steam/`

## Recommended path

1. Create or choose a Steamworks **build account** (manual; prefer a dedicated publisher account).
2. **Helper:** `npx adaptfully steam-publish` — installs steamcmd if needed, logs in interactively, writes `steam.json`.
3. Set upload `steamId` on the deployment `manifest.json` (and client `platforms.*.steamId` if you use Steamworks auth).

## What you need

| Goal | Files |
|------|--------|
| `steam-dev` (local Electron debug) | None |
| `steam` release upload | `steam.json` (+ `manifest.json` with upload `steamId`) |

## Full steps

### 1. Prerequisites

- A Steamworks partner app.
- A Steam account allowed to upload builds (Steam Guard may be enabled).

### 2. Helper: write `steam.json`

**Helper:** `npx adaptfully steam-publish [--username U] [--password P] [--deployment steam]`

If you run this, **skip to step 6**.

The helper installs steamcmd under `~/.adaptfully/steamcmd` when needed, logs in (enter a Steam Guard code if prompted), and writes `assets/meta/deployments/steam/steam.json`.

### 3. Manual alternative: install steamcmd

Skip this if you used step 2.

Download steamcmd for your OS from Valve and unpack it somewhere durable.

### 4. Manual alternative: log in once

Skip this if you used step 2.

```bash
steamcmd +login YOUR_USER YOUR_PASSWORD +quit
```

Complete Steam Guard if prompted. After a successful login, steamcmd stores session files under its install directory (`config/config.vdf`, and an `ssfn*` sentry file when Guard is enabled).

### 5. Manual alternative: assemble `steam.json`

Skip this if you used step 2.

Create `assets/meta/deployments/steam/steam.json`:

```json
{
  "username": "(your Steam build account)",
  "password": "(your password)",
  "configVdf": "(base64 of config/config.vdf)",
  "sentryFileName": "(ssfn filename — only with Steam Guard)",
  "sentryFile": "(base64 of the ssfn file — only with Steam Guard)"
}
```

Accounts **without** Steam Guard only need `username`, `password`, and `configVdf`.

### 6. App IDs (client vs upload)

These are independent:

| Setting | Purpose |
|---------|---------|
| `config.platforms.<name>.steamId` | Client Steamworks / `steam-auth` |
| `assets/meta/deployments/steam/manifest.json` → `steamId` | Depot upload target |

You can ship with Steam auth and no upload credentials, or upload without client Steamworks.

Example `manifest.json`:

```json
{
  "type": "steam",
  "steamId": 480
}
```

### 7. Done when

- [ ] For uploads: `steam.json` exists and login tokens are valid
- [ ] Upload `steamId` is set on the deployment manifest
- [ ] Client `steamId` is set on the platform if you use Steamworks auth
- [ ] Credential files are gitignored

## Notes

- Re-run `adaptfully steam-publish` when Steam invalidates the token (new machine, password change, or expired Guard).
- `steam-dev` never requires `steam.json`.
