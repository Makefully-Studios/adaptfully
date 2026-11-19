import fsp from 'node:fs/promises';
import path from 'node:path';
import {
    defaultDeploymentCredentialPath,
    ensureDeploymentManifest,
    ensurePublishCredentialsGitignore,
    parsePublishCredentialArgv,
    promptRequired,
} from './publish-credentials.js';

const EPIC_MANIFEST_ID_FIELDS = ['organizationId', 'productId', 'artifactId'];

/**
 * @param {string} [projectRoot]
 * @param {string} [deploymentKey='epic']
 */
export function defaultEpicPublishPath(projectRoot = '.', deploymentKey = 'epic') {
    return defaultDeploymentCredentialPath(projectRoot, deploymentKey, 'epic.json');
}

/**
 * BPT client credentials. These are not EOS SDK client credentials.
 * @param {{ clientId?: string, clientSecret?: string }} input
 */
export function buildEpicPublishJson(input) {
    const clientId = String(input?.clientId ?? '').trim();
    const clientSecret = String(input?.clientSecret ?? '').trim();

    if (!clientId || !clientSecret) {
        throw new Error('Epic BPT credentials require both clientId and clientSecret.');
    }

    return { clientId, clientSecret };
}

/**
 * Write provided manifest ids only. Never invent missing organization/product/artifact ids.
 * @param {string} deploymentDir
 * @param {{ organizationId?: string, productId?: string, artifactId?: string }} ids
 * @param {(message: string) => void} log
 */
export async function writeEpicManifestIds(deploymentDir, ids, log = console.log) {
    const manifestPath = path.join(deploymentDir, 'manifest.json');
    /** @type {Record<string, unknown>} */
    let manifest = {};

    try {
        manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    } catch {
        manifest = {};
    }

    let changed = false;

    for (const field of EPIC_MANIFEST_ID_FIELDS) {
        const value = ids?.[field];
        if (value == null || String(value).trim() === '') {
            continue;
        }
        const next = String(value).trim();
        if (manifest[field] !== next) {
            manifest[field] = next;
            changed = true;
        }
    }

    if (changed) {
        await fsp.mkdir(deploymentDir, { recursive: true });
        await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
        log(`adaptfully: updated ${manifestPath} with Epic ids`);
    }

    const missing = EPIC_MANIFEST_ID_FIELDS.filter((field) => {
        const value = manifest[field];
        return value == null || String(value).trim() === '';
    });

    if (missing.length) {
        log(
            `adaptfully: set ${missing.join(', ')} in ${manifestPath} before \`adaptfully release epic\``,
        );
    }

    return { manifestPath, missing, updated: changed };
}

/**
 * @param {{
 *   clientId?: string,
 *   clientSecret?: string,
 *   organizationId?: string,
 *   productId?: string,
 *   artifactId?: string,
 *   output?: string,
 *   deployment?: string,
 *   projectRoot?: string,
 *   log?: (message: string) => void,
 * }} [options]
 */
export async function runEpicPublish(options = {}) {
    const log = options.log ?? console.log;
    const projectRoot = options.projectRoot ?? '.';
    const deploymentKey = options.deployment ?? 'epic';
    const outputPath = path.resolve(
        options.output ?? defaultEpicPublishPath(projectRoot, deploymentKey),
    );
    const deploymentDir = path.dirname(outputPath);

    const clientId = await promptRequired('BPT Client ID: ', options.clientId);
    const clientSecret = await promptRequired('BPT Client Secret: ', options.clientSecret);
    const epicJson = buildEpicPublishJson({ clientId, clientSecret });

    await fsp.mkdir(deploymentDir, { recursive: true });
    await fsp.writeFile(outputPath, `${JSON.stringify(epicJson, null, 4)}\n`);
    await ensureDeploymentManifest(deploymentDir, 'epic', log);
    await writeEpicManifestIds(deploymentDir, {
        organizationId: options.organizationId,
        productId: options.productId,
        artifactId: options.artifactId,
    }, log);
    await ensurePublishCredentialsGitignore(projectRoot, {
        extraPaths: [outputPath],
        log,
    });

    log(`adaptfully: wrote ${outputPath}`);
    log('adaptfully: epic.json holds BPT credentials, not EOS SDK client credentials.');

    return { outputPath, epicJson, deploymentKey };
}

/**
 * @param {string[]} [argv]
 */
export async function epicPublishFromCli(argv = process.argv) {
    return runEpicPublish(parsePublishCredentialArgv(argv));
}
