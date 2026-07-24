import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
    defaultDeploymentCredentialPath,
    ensureDeploymentManifest,
    ensurePublishCredentialsGitignore,
    parsePublishCredentialArgv,
    resolveUserPath,
} from './publish-credentials.js';

/**
 * @param {string} [projectRoot]
 * @param {string} [deploymentKey='ios']
 */
export function defaultApplePublishPath(projectRoot = '.', deploymentKey = 'ios') {
    return defaultDeploymentCredentialPath(projectRoot, deploymentKey, 'apple.json');
}

/**
 * @param {{ category: string, identity: string, username: string, password: string }} auth
 */
export function buildApplePublishJson(auth) {
    return {
        category: String(auth.category).trim(),
        identity: String(auth.identity).trim(),
        username: String(auth.username).trim(),
        password: String(auth.password),
    };
}

/**
 * @param {unknown} raw
 * @returns {{ category: string, identity: string, username: string, password: string }}
 */
export function validateApplePublishJson(raw) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Apple credentials must be a JSON object.');
    }

    const json = /** @type {Record<string, unknown>} */ (raw);
    const required = ['category', 'identity', 'username', 'password'];
    const missing = required.filter((key) => {
        const value = json[key];
        return value == null || String(value).trim() === '';
    });

    if (missing.length) {
        throw new Error(`Apple credentials JSON is missing required field(s): ${missing.join(', ')}.`);
    }

    return buildApplePublishJson({
        category: /** @type {string} */ (json.category),
        identity: /** @type {string} */ (json.identity),
        username: /** @type {string} */ (json.username),
        password: /** @type {string} */ (json.password),
    });
}

/**
 * @param {{
 *   category?: string,
 *   identity?: string,
 *   username?: string,
 *   password?: string,
 *   from?: string,
 *   output?: string,
 *   deployment?: string,
 *   projectRoot?: string,
 *   log?: (message: string) => void,
 * }} [options]
 */
export async function runApplePublish(options = {}) {
    const log = options.log ?? console.log;
    const projectRoot = options.projectRoot ?? '.';
    const deploymentKey = options.deployment ?? 'ios';
    const outputPath = path.resolve(
        options.output ?? defaultApplePublishPath(projectRoot, deploymentKey),
    );

    /** @type {{ category: string, identity: string, username: string, password: string }} */
    let appleJson;

    if (options.from) {
        const fromPath = resolveUserPath(options.from);
        let raw;

        try {
            raw = JSON.parse(await fsp.readFile(fromPath, 'utf8'));
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Unable to read Apple credentials JSON at "${fromPath}": ${message}`);
        }

        appleJson = validateApplePublishJson(raw);
    } else {
        let category = options.category ?? process.env.APPLE_CATEGORY;
        let identity = options.identity ?? process.env.APPLE_IDENTITY;
        let username = options.username
            ?? process.env.APPLE_ID
            ?? process.env.APPLE_USERNAME;
        let password = options.password
            ?? process.env.APPLE_APP_SPECIFIC_PASSWORD
            ?? process.env.APPLE_PASSWORD;

        if (!category || !identity || !username || !password) {
            const rl = readline.createInterface({ input, output });

            try {
                if (!category) {
                    category = String(await rl.question('App Store category: ')).trim();
                }
                if (!identity) {
                    identity = String(await rl.question('Apple team identity (e.g. TEAMID): ')).trim();
                }
                if (!username) {
                    username = String(await rl.question('Apple ID username: ')).trim();
                }
                if (!password) {
                    password = String(
                        await rl.question('Apple app-specific password: '),
                    );
                }
            } finally {
                rl.close();
            }
        }

        appleJson = validateApplePublishJson({
            category,
            identity,
            username,
            password,
        });
    }

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(outputPath, `${JSON.stringify(appleJson, null, 4)}\n`);
    await ensureDeploymentManifest(path.dirname(outputPath), 'apple', log);
    await ensurePublishCredentialsGitignore(projectRoot, {
        extraPaths: [outputPath],
        log,
    });

    log(`adaptfully: wrote ${outputPath}`);
    log(`adaptfully: Apple ID ${appleJson.username} (identity ${appleJson.identity})`);

    return { outputPath, appleJson, deploymentKey };
}

/**
 * @param {string[]} [argv]
 */
export async function applePublishFromCli(argv = process.argv) {
    return runApplePublish(parsePublishCredentialArgv(argv));
}
