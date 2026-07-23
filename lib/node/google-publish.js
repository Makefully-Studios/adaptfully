import fsp from 'node:fs/promises';
import path from 'node:path';
import {
    defaultDeploymentCredentialPath,
    ensureDeploymentManifest,
    ensurePublishCredentialsGitignore,
    parsePublishCredentialArgv,
    promptRequired,
} from './publish-credentials.js';

const GOOGLE_REQUIRED_FIELDS = [
    'type',
    'project_id',
    'private_key',
    'client_email',
];

/**
 * @param {string} [projectRoot]
 * @param {string} [deploymentKey='android']
 */
export function defaultGooglePublishPath(projectRoot = '.', deploymentKey = 'android') {
    return defaultDeploymentCredentialPath(projectRoot, deploymentKey, 'google.json');
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function validateGoogleServiceAccount(raw) {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Google Play credentials must be a JSON object (service account key).');
    }

    /** @type {Record<string, unknown>} */
    const json = { .../** @type {Record<string, unknown>} */ (raw) };

    if (json.type != null && json.type !== 'service_account') {
        throw new Error(
            `Google service account JSON type must be "service_account" (got ${JSON.stringify(json.type)}).`,
        );
    }

    const missing = GOOGLE_REQUIRED_FIELDS.filter((key) => {
        const value = json[key];
        return value == null || String(value).trim() === '';
    });

    if (missing.length) {
        throw new Error(
            `Google service account JSON is missing required field(s): ${missing.join(', ')}.`,
        );
    }

    return json;
}

/**
 * @param {{
 *   from?: string,
 *   output?: string,
 *   deployment?: string,
 *   projectRoot?: string,
 *   log?: (message: string) => void,
 * }} [options]
 */
export async function runGooglePublish(options = {}) {
    const log = options.log ?? console.log;
    const projectRoot = options.projectRoot ?? '.';
    const deploymentKey = options.deployment ?? 'android';
    const outputPath = path.resolve(
        options.output ?? defaultGooglePublishPath(projectRoot, deploymentKey),
    );

    const fromPath = path.resolve(
        await promptRequired(
            'Path to Google Play service account JSON: ',
            options.from ?? process.env.GOOGLE_APPLICATION_CREDENTIALS,
        ),
    );

    let raw;

    try {
        raw = JSON.parse(await fsp.readFile(fromPath, 'utf8'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Unable to read Google service account JSON at "${fromPath}": ${message}`);
    }

    const googleJson = validateGoogleServiceAccount(raw);

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(outputPath, `${JSON.stringify(googleJson, null, 4)}\n`);
    await ensureDeploymentManifest(path.dirname(outputPath), 'google', log);
    await ensurePublishCredentialsGitignore(projectRoot, {
        extraPaths: [outputPath],
        log,
    });

    log(`adaptfully: wrote ${outputPath}`);
    log(`adaptfully: imported service account ${googleJson.client_email}`);

    return { outputPath, googleJson, deploymentKey };
}

/**
 * @param {string[]} [argv]
 */
export async function googlePublishFromCli(argv = process.argv) {
    return runGooglePublish(parsePublishCredentialArgv(argv));
}
