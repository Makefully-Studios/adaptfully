# Epic Games Store credentials

Set up BuildPatchTool (BPT) upload credentials for Epic release deploys. Debug Epic builds need no upload credentials.

**Default folder:** `assets/meta/deployments/epic/`

BPT Client ID / Client Secret are **not** EOS SDK credentials. The game client uses `platforms.epic.eosClientId` (and product / sandbox / deployment ids) for `epic-auth`. The upload uses the BPT pair below.

## Recommended path

1. In the [Epic Developer Portal](https://dev.epicgames.com/portal), open your product → **Product Settings** → **BPT credentials**. Copy the BPT Client ID and Client Secret.
2. Open **Epic Games Store** → **Artifacts and Binaries**, and copy the organization id, product id, and artifact id.
3. **Helper:** `npx adaptfully epic-publish` — writes `epic.json` and `manifest.json` (`"type": "epic"`).
4. If you did not pass id flags, fill `organizationId`, `productId`, and `artifactId` in `manifest.json`.

## What you need

| Goal | Files |
|------|--------|
| `epic-dev` (local Electron debug) | None for upload. Set EOS ids on `platforms.epic-dev` if you use `epic-auth`. |
| `epic` release upload | `epic.json` + `manifest.json` with organization, product, and artifact ids |

## Full steps

### 1. Prerequisites

- An Epic Games Store product with an artifact (Windows and macOS binaries share one artifact id).
- A portal role that can read BPT credentials (Owner, Admin, or Store).

### 2. Helper: write `epic.json`

**Helper:**

```bash
npx adaptfully epic-publish \
  --client-id BPT_CLIENT_ID \
  --client-secret BPT_CLIENT_SECRET \
  [--organization-id ORG] [--product-id PRODUCT] [--artifact-id ARTIFACT] \
  [--deployment epic]
```

The helper writes `assets/meta/deployments/epic/epic.json` and ensures `manifest.json` has `"type": "epic"`. Id flags are written when you pass them. The helper does not invent missing ids.

### 3. Manual alternative: `epic.json`

```json
{
  "clientId": "(BPT Client ID)",
  "clientSecret": "(BPT Client Secret)"
}
```

### 4. `manifest.json`

```json
{
  "type": "epic",
  "organizationId": "(organization id)",
  "productId": "(product id)",
  "artifactId": "(artifact id)"
}
```

Organization id: Developer Portal → **Organization** → **Settings**. Product id: **Product Settings** → **SDK Download and Credentials** (or the BPT command-line template on the artifact). Artifact id: **Epic Games Store** → **Artifacts and Binaries** → artifact details.

Wrapfully uploads Windows and Mac as separate binaries on that one artifact, with build versions `{version}-win` and `{version}-mac`.

### 5. EOS ids for `epic-auth` (client, not upload)

On the Electron platform (not in `epic.json`):

```json
"epic": {
  "packager": "electron",
  "eos": true,
  "eosProductId": "...",
  "eosSandboxId": "...",
  "eosDeploymentId": "...",
  "eosClientId": "...",
  "registrations": { "auth": "epic-auth" },
  "builder": ["win", "mac"],
  "deployments": ["zip", "epic"]
}
```

`eosClientId` is the EOS SDK client id. Do not put the BPT client secret in platform config.

`epic-dev` uses the same EOS ids and Dev Auth (`127.0.0.1:6300`, credential name `adaptfully`) when the Epic launcher is not running. Set `EOS_DEV_ACCOUNT_ID` or `userData/eos-dev-identity.json` (`{ "id": "..." }`) when the EOS redistributable login helper is not staged.

### 6. Host tools

The Wrapfully machine that uploads needs BuildPatchTool extracted at `./BuildPatchTool/` (download from Artifacts and Binaries). Optional EOS redistributables live at `./EOS/SDK/` or in the game zip as `meta/eos/`.
