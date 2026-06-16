# Publishing `@makefully/adaptfully`

This package uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) from GitHub Actions. No long-lived `NPM_TOKEN` secret is required.

## One-time npm setup

1. Sign in at [npmjs.com](https://www.npmjs.com/) as a maintainer of `@makefully/adaptfully`.
2. Open **Packages → @makefully/adaptfully → Settings → Trusted publishing**.
3. Select **GitHub Actions** and configure:

| Field | Value |
|-------|-------|
| Organization or user | `Makefully-Studios` |
| Repository | `wrapfully-client` |
| Workflow filename | `publish.yml` |
| Environment | *(leave empty unless you add a GitHub environment)* |

4. Under **Allowed actions**, enable `npm publish`.
5. Save the trusted publisher configuration.

Optional hardening after verifying publishes work:

- **Settings → Publishing access → Require two-factor authentication and disallow tokens**

## Release process

1. Bump `version` in `package.json` and `package-lock.json`.
2. Update `CHANGELOG.md`.
3. Commit and push to `main`.

The [publish workflow](.github/workflows/publish.yml) runs when `package.json` or `package-lock.json` changes on `main`. It publishes automatically when the version is higher than what is already on npm.

### Manual publish

Run **Actions → Publish to npm → Run workflow** to publish the current `package.json` version if it is not already on npm.

## Requirements

- npm CLI **11.5.1+** (workflow upgrades npm explicitly before publish)
- `package.json` `repository.url` must match the GitHub repo (`https://github.com/Makefully-Studios/wrapfully-client.git`)
- Your npm account must be an owner or member of the `@makefully` organization with publish access
