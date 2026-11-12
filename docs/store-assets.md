# Store listing assets (`meta/store-assets`)

Play Console and App Store Connect listing images ship in the game zip as
`meta/store-assets/` (source: `assets/meta/store-assets/`).

Wrapfully syncs them via opt-in deployers:

| Deployer | Typical key | Store API |
|----------|-------------|-----------|
| `google-listing` | `android-listing` | Play `edits.images` |
| `apple-listing` | `ios-listing` | App Store Connect Asset Library + placements |

Keep listing keys **out** of the platform `deployments` fan-out used for every
binary release unless you intentionally want art synced on each release.
Prefer a dedicated deploy:

```bash
adaptfully deploy android --deployment android-listing
adaptfully deploy ios --deployment ios-listing
```

## Layout

```
assets/meta/store-assets/
  upload-ledger.json          # set-level SHA-256 skip (written after successful sync)
  android/<locale>/images/…   # Play AppImageType folders + featureGraphic/icon
  ios/<locale>/
    screenshots/…             # device class from exact pixel size
    creative/…                # product-page-header, search-results, …
    icon-1024.png
```

## App Store Connect API compliance (`apple-listing`)

Apple restricts the App Store Connect API to **internal use within your Apple
Developer team** (your own apps’ workflow). You may **not** use it to provide
services to third parties, share API keys outside your team, or solicit keys
from others.

Wrapfully adds a **fleet gate** so random outside repos cannot turn on ASC
listing upload against a shared Wrapfully host:

| Side | Field |
|------|--------|
| Game (gitignored `apple.json`) | `"ascApiTeamToken": "<secret>"` |
| Wrapfully host | `ASC_API_TEAM_TOKEN_HASH` env **or** `cred.json` → `ascApiTeamTokenHash` (SHA-256 hex of the secret) |

```bash
# Generate a secret, store plaintext only in gitignored apple.json
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Host hash (set on each Wrapfully worker)
node -e "const c=require('crypto'); const t=process.argv[1]; console.log(c.createHash('sha256').update(t).digest('hex'))" "<secret>"
```

Listing `manifest.json` stays trackable (no secret):

```json
{
  "type": "apple-listing",
  "credentialsFrom": "ios",
  "sourcePath": "meta/store-assets/ios",
  "locales": ["en-US"]
}
```

Rules of thumb:

1. Share the team token only with orgs authorized to use ASC listing on **that** Wrapfully fleet.
2. Each org still uses **their own** ASC API Issuer/Key/`.p8` for **their** apps.
3. Self-hosted Wrapfully operators set **their own** token hash; do not publish the plaintext token.

Credentials and portal steps: [credentials/ios.md](./credentials/ios.md#app-store-connect-api--listing-sync).
