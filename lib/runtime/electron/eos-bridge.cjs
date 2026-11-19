/* global module, process, require */
const fs = require('fs');
const path = require('path');

const DEV_AUTH_HOST = '127.0.0.1:6300';
const DEV_AUTH_CREDENTIAL = 'adaptfully';

/**
 * Epic Games Launcher passes `-epicuserid=`, `-AUTH_TYPE=exchangecode`, and
 * `-AUTH_PASSWORD=<exchange code>` on the game command line.
 * @param {string[]} argv
 */
function parseEpicArgv(argv) {
    /** @type {Record<string, string>} */
    const flags = {};

    for (const arg of argv || []) {
        const text = String(arg);
        if (text === '-EpicPortal') {
            flags.epicportal = '1';
            continue;
        }

        const eq = text.indexOf('=');
        if (eq <= 0) {
            continue;
        }

        const key = text.slice(0, eq).replace(/^-/, '').toLowerCase();
        flags[key] = text.slice(eq + 1);
    }

    const authType = (flags.auth_type || '').toLowerCase();

    return {
        accountId: flags.epicuserid || '',
        displayName: flags.epicusername || '',
        exchangeCode: authType === 'exchangecode' ? (flags.auth_password || '') : '',
        authType: authType || (flags.epicuserid ? 'exchangecode' : ''),
    };
}

/**
 * @param {ReturnType<typeof parseEpicArgv>} parsed
 */
function identityFromParsed(parsed) {
    if (!parsed?.accountId) {
        return null;
    }

    return {
        id: String(parsed.accountId),
        email: '',
        displayName: parsed.displayName || '',
        authType: parsed.authType || 'exchangecode',
        exchangeCode: parsed.exchangeCode || '',
    };
}

/**
 * @param {string[]} [argv]
 */
function launcherIdentity(argv = process.argv) {
    return identityFromParsed(parseEpicArgv(argv));
}

function eosResourceDirs() {
    /** @type {string[]} */
    const dirs = [];

    if (process.resourcesPath) {
        dirs.push(path.join(process.resourcesPath, 'eos'));
    }

    dirs.push(path.join(__dirname, 'eos'));
    return dirs;
}

function tryLoadNative() {
    for (const dir of eosResourceDirs()) {
        for (const file of ['adaptfully-login.cjs', 'login.cjs']) {
            const candidate = path.join(dir, file);
            if (!fs.existsSync(candidate)) {
                continue;
            }

            try {
                return require(candidate);
            } catch (err) {
                console.error('EOS native login helper failed:', err);
            }
        }
    }

    return null;
}

function identityFromEnv() {
    const envId = process.env.EOS_DEV_ACCOUNT_ID;
    if (!envId) {
        return null;
    }

    return {
        id: String(envId),
        email: '',
        displayName: process.env.EOS_DEV_DISPLAY_NAME || '',
        authType: 'developer',
        exchangeCode: '',
    };
}

function readDevIdentityFile() {
    try {
        const { app } = require('electron');
        const file = path.join(app.getPath('userData'), 'eos-dev-identity.json');
        if (!fs.existsSync(file)) {
            return null;
        }

        const json = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!json?.id) {
            return null;
        }

        return {
            id: String(json.id),
            email: '',
            displayName: json.displayName || '',
            authType: 'developer',
            exchangeCode: '',
        };
    } catch {
        return null;
    }
}

/**
 * epic-dev: Dev Auth Tool via a staged EOS login helper, else a local identity.
 * @param {object} config
 */
async function loginDeveloper(config) {
    const native = tryLoadNative();
    if (native && typeof native.loginDeveloper === 'function') {
        const result = await native.loginDeveloper({
            host: config.devAuthHost || DEV_AUTH_HOST,
            credentialName: config.devAuthCredential || DEV_AUTH_CREDENTIAL,
            productId: config.productId,
            sandboxId: config.sandboxId,
            deploymentId: config.deploymentId,
            clientId: config.clientId,
        });

        if (result?.id) {
            return {
                id: String(result.id),
                email: '',
                displayName: result.displayName || '',
                authType: 'developer',
                exchangeCode: result.exchangeCode || '',
            };
        }
    }

    const fromEnv = identityFromEnv();
    if (fromEnv) {
        return fromEnv;
    }

    const fromFile = readDevIdentityFile();
    if (fromFile) {
        return fromFile;
    }

    const err = new Error(
        'EOS Dev Auth needs a staged SDK login helper (eos/adaptfully-login.cjs), '
        + 'userData/eos-dev-identity.json, or EOS_DEV_ACCOUNT_ID.',
    );
    err.code = 'EOS_DEV_AUTH_UNAVAILABLE';
    throw err;
}

/**
 * @param {object} config
 * @param {string[]} [argv]
 */
function createBridge(config, argv = process.argv) {
    let cached = launcherIdentity(argv);

    return {
        config,
        getIdentity() {
            return cached;
        },
        async login() {
            if (cached?.id) {
                return cached;
            }

            if (config?.devAuth) {
                cached = await loginDeveloper(config);
                return cached;
            }

            const again = launcherIdentity(argv);
            if (again?.id) {
                cached = again;
                return cached;
            }

            const err = new Error('Epic Games Launcher identity was not found on the process command line.');
            err.code = 'EOS_LAUNCHER_IDENTITY_MISSING';
            throw err;
        },
    };
}

/**
 * @param {object} config
 * @param {{ ipcMain?: { handle: Function } }} [electron]
 */
function install(config, electron) {
    const electronApi = electron || require('electron');
    const bridge = createBridge(config);
    const ipc = electronApi.ipcMain;

    ipc.handle('adaptfully:eos-identity', () => bridge.getIdentity());
    ipc.handle('adaptfully:eos-login', () => bridge.login());
    ipc.handle('adaptfully:eos-exchange-code', () => bridge.getIdentity()?.exchangeCode || '');

    return bridge;
}

module.exports = {
    DEV_AUTH_HOST,
    DEV_AUTH_CREDENTIAL,
    parseEpicArgv,
    launcherIdentity,
    loginDeveloper,
    createBridge,
    install,
};
