# Device auth (PIN / QR)

`device-auth` is an Adaptfully auth plugin for limited-input shells (LG webOS TV, etc.). The TV build only **starts** and **polls** a short-lived session. Companion Google (or other) sign-in happens on the game’s **existing web deploy**, not inside the TV package.

## Registration

```json
"lgtv": {
  "packager": "web",
  "builder": "webos",
  "registrations": {
    "auth": "device-auth",
    "host": "tv-host",
    "config": "javascript/adaptfully-bridge.js"
  }
}
```

## Config keys

| Key | Purpose |
|-----|---------|
| `deviceAuthStartUrl` | `POST` mint session |
| `deviceAuthPollUrl` | `GET` poll (`?device_code=`) |
| `deviceAuthCompanionBase` | Fallback QR/base URL if start omits `verificationUrl` |

## HTTP protocol

### `POST start`

Response:

```json
{
  "deviceCode": "opaque-poll-token",
  "userCode": "AB12CD",
  "expiresIn": 600,
  "interval": 2000,
  "verificationUrl": "https://game.example/tv-login.html?code=AB12CD"
}
```

### `GET poll?device_code=…`

```json
{ "status": "pending" }
```

```json
{ "status": "approved", "user": { "id": "provider-subject", "email": "a@b.co" } }
```

Also: `expired`, `denied`.

### `POST complete`

Body: `user_code` or `device_code`, plus `plusId`, `email`, optional `user_id`.

## Companion helpers

Optional page script: `lib/runtime/auth/device-auth-companion.js`  
(`adaptfully.auth.deviceCompanion.readCodeFromLocation()` / `.complete(...)`).

## Events

`window` CustomEvent `adaptfully:device-auth` with `detail.phase` of `pending` | `approved` | `expired` | `denied` | `error`.  
`tv-host` forwards these via `onDeviceAuth(cb)`.
