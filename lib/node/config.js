import fs from 'node:fs/promises';

const DEFAULT_SHOWFULLY_SERVER = process.env.SHOWFULLY_DEV
    ? 'http://localhost:9630/'
    : 'https://make.makefullystudios.com/';

/**
 * @param {string} [projectRoot='.']
 */
export async function loadProjectConfig(projectRoot = '.') {
    const pkgPath = `${projectRoot}/package.json`;
    const wrapfullyPath = `${projectRoot}/wrapfully.json`;

    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    let wrapfullyConfig = {};

    try {
        wrapfullyConfig = JSON.parse(await fs.readFile(wrapfullyPath, 'utf8'));
    } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') {
            throw err;
        }
    }

    pkg.config = {
        ...pkg.config,
        ...wrapfullyConfig,
    };

    return { pkg, wrapfullyConfig };
}

/**
 * Showfully Yap base URL (not Wrapfully HTTP).
 * @param {{ server?: string, showfullyServer?: string }} wrapfullyConfig
 * @param {string} [cliServer]
 */
export function resolveServerUrl(wrapfullyConfig, cliServer) {
    return (
        cliServer
        || process.env.SHOWFULLY_SERVER
        || wrapfullyConfig.showfullyServer
        || wrapfullyConfig.server
        || process.env.WRAPFULLY_SERVER
        || DEFAULT_SHOWFULLY_SERVER
    ).replace(/\/?$/, '/');
}

/**
 * Required PAT for Yap submit/poll/download.
 * @param {{ accessToken?: string, showfullyPat?: string }} wrapfullyConfig
 * @param {string} [cliToken]
 */
export function resolveAccessToken(wrapfullyConfig = {}, cliToken) {
    const token = (
        cliToken
        || process.env.SHOWFULLY_PAT
        || process.env.WRAPFULLY_ACCESS_TOKEN
        || wrapfullyConfig.accessToken
        || wrapfullyConfig.showfullyPat
        || ''
    ).trim();

    if (!token) {
        throw new Error(
            'Showfully PAT required. Set SHOWFULLY_PAT or wrapfully.json "accessToken" '
            + '(Settings → API tokens on play.makefullystudios.com).',
        );
    }

    return token;
}

/**
 * @param {{ encrypt?: boolean }} wrapfullyConfig
 * @param {boolean} [cliEncrypt]
 */
export function resolveEncryptFlag(wrapfullyConfig = {}, cliEncrypt) {
    if (typeof cliEncrypt === 'boolean') {
        return cliEncrypt;
    }
    return !!wrapfullyConfig.encrypt;
}
