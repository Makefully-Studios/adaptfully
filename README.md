# Wrapfully Client

Sends a project's deploy folder and build configuration to a [Wrapfully](https://github.com/Makefully-Studios/wrapfully) build server.

## Install

```bash
npm install @makefully/wrapfully-client
```

## Usage

Run from your project root (where `package.json` and your deploy folder live):

```bash
npx wrapfully-deploy [builder] [server] [mode]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `builder` | `all` | Build target passed to the Wrapfully server (e.g. `android`, `ios`, `win`, `mac`) |
| `server` | see below | Wrapfully server base URL |
| `mode` | `extract` | `extract` writes the build response to `./output/`; any other value saves a zip file |

### Server URL

The server URL is resolved in this order:

1. CLI argument (`server` above)
2. `WRAPFULLY_SERVER` environment variable
3. `server` field in `wrapfully.json`
4. `http://localhost:9630/`

Do not commit server URLs, credentials, or other secrets to version control. Keep private infrastructure addresses in environment variables or local config files listed in `.gitignore`.

### wrapfully.json

Optional project config merged into the package payload sent to the server:

```json
{
    "deployFolder": "deploy",
    "server": "http://localhost:9630/"
}
```

## License

MIT
