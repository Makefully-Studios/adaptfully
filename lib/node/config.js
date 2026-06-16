import fs from 'node:fs/promises';

const DEFAULT_SERVER = 'http://localhost:9630/';

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
 * @param {{ server?: string }} wrapfullyConfig
 * @param {string} [cliServer]
 */
export function resolveServerUrl(wrapfullyConfig, cliServer) {
    return (
        cliServer
        || process.env.WRAPFULLY_SERVER
        || wrapfullyConfig.server
        || DEFAULT_SERVER
    ).replace(/\/?$/, '/');
}
