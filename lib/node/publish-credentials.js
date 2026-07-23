import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/** Patterns that should never be committed from deployment credential folders. */
export const PUBLISH_CREDENTIAL_GITIGNORE_PATTERNS = [
    'assets/meta/deployments/**/sftp.json',
    'assets/meta/deployments/**/steam.json',
    'assets/meta/deployments/**/build.json',
    'assets/meta/deployments/**/google.json',
    'assets/meta/deployments/**/apple.json',
    'assets/meta/deployments/**/ms.json',
    'assets/meta/deployments/**/android/',
    'assets/meta/deployments/**/ms/',
];

const GITIGNORE_SECTION_HEADER = '# Adaptfully publish credentials — do not commit';

/**
 * @param {string} [projectRoot]
 * @param {string} deploymentKey
 * @param {string} filename
 */
export function defaultDeploymentCredentialPath(projectRoot = '.', deploymentKey, filename) {
    return path.resolve(
        projectRoot,
        'assets',
        'meta',
        'deployments',
        deploymentKey,
        filename,
    );
}

/**
 * @param {string} content
 * @returns {Set<string>}
 */
function gitignoreLineSet(content) {
    return new Set(
        content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#')),
    );
}

/**
 * Ensure project `.gitignore` ignores Adaptfully deployment credential files.
 * Idempotent: only appends missing patterns. Optionally also ignores a specific
 * credential file path (e.g. custom `--output`).
 *
 * @param {string} [projectRoot='.']
 * @param {{
 *   extraPaths?: string[],
 *   log?: (message: string) => void,
 * }} [options]
 */
export async function ensurePublishCredentialsGitignore(projectRoot = '.', options = {}) {
    const log = options.log ?? console.log;
    const root = path.resolve(projectRoot);
    const gitignorePath = path.join(root, '.gitignore');

    let content = '';
    let existed = true;

    try {
        content = await fsp.readFile(gitignorePath, 'utf8');
    } catch {
        existed = false;
        content = '';
    }

    const existing = gitignoreLineSet(content);
    /** @type {string[]} */
    const toAdd = [];

    for (const pattern of PUBLISH_CREDENTIAL_GITIGNORE_PATTERNS) {
        if (!existing.has(pattern)) {
            toAdd.push(pattern);
            existing.add(pattern);
        }
    }

    for (const extra of options.extraPaths ?? []) {
        const absolute = path.resolve(extra);
        const relative = path.relative(root, absolute).replace(/\\/g, '/');

        if (!relative || relative.startsWith('..')) {
            // Outside the project — skip; can't usefully gitignore it here.
            continue;
        }

        if (!existing.has(relative)) {
            toAdd.push(relative);
            existing.add(relative);
        }
    }

    if (toAdd.length === 0) {
        return { gitignorePath, added: [], created: false, updated: false };
    }

    const needsHeader = !content.includes(GITIGNORE_SECTION_HEADER);
    const prefix = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    const section = [
        needsHeader ? GITIGNORE_SECTION_HEADER : null,
        ...toAdd,
        '',
    ].filter((line) => line != null).join('\n');

    await fsp.writeFile(gitignorePath, `${content}${prefix}${section}`);

    if (!existed) {
        log(`adaptfully: created ${gitignorePath} with publish credential ignores`);
    } else {
        log(`adaptfully: updated ${gitignorePath} (+${toAdd.length} credential ignore${toAdd.length === 1 ? '' : 's'})`);
    }

    return { gitignorePath, added: toAdd, created: !existed, updated: true };
}

/**
 * Ensure deployment folder has a manifest.json with the given deployer type.
 * Creates the file when missing; updates `type` when wrong; leaves other fields intact.
 *
 * @param {string} deploymentDir
 * @param {string} type
 * @param {(message: string) => void} [log]
 */
export async function ensureDeploymentManifest(deploymentDir, type, log = console.log) {
    const manifestPath = path.join(deploymentDir, 'manifest.json');
    /** @type {Record<string, unknown>} */
    let manifest = {};

    try {
        manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    } catch {
        // create below
    }

    if (manifest.type === type) {
        return { manifestPath, created: false, updated: false };
    }

    const previous = manifest.type;
    manifest.type = type;
    await fsp.mkdir(deploymentDir, { recursive: true });
    await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);

    if (previous == null) {
        log(`adaptfully: wrote ${manifestPath} with type "${type}"`);
        return { manifestPath, created: true, updated: false };
    }

    log(`adaptfully: updated ${manifestPath} type "${previous}" → "${type}"`);
    return { manifestPath, created: false, updated: true };
}

/**
 * @param {string} prompt
 * @param {string} [existing]
 * @returns {Promise<string>}
 */
export async function promptRequired(prompt, existing) {
    if (existing != null && String(existing).trim() !== '') {
        return String(existing).trim();
    }

    const rl = readline.createInterface({ input, output });

    try {
        const value = String(await rl.question(prompt)).trim();
        if (!value) {
            throw new Error(`${prompt.replace(/:\s*$/, '')} is required.`);
        }
        return value;
    } finally {
        rl.close();
    }
}

/**
 * Parse shared CLI flags used by publish credential helpers.
 * @param {string[]} argv
 * @param {number} [startIndex=3]
 */
export function parsePublishCredentialArgv(argv, startIndex = 3) {
    /** @type {Record<string, string>} */
    const options = {
        projectRoot: '.',
    };

    for (let i = startIndex; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--from' && argv[i + 1]) {
            options.from = argv[++i];
        } else if (arg === '--output' && argv[i + 1]) {
            options.output = argv[++i];
        } else if (arg === '--deployment' && argv[i + 1]) {
            options.deployment = argv[++i];
        } else if (arg === '--project-root' && argv[i + 1]) {
            options.projectRoot = argv[++i];
        } else if (arg === '--steamcmd-dir' && argv[i + 1]) {
            options.steamcmdDir = argv[++i];
        } else if (arg === '--category' && argv[i + 1]) {
            options.category = argv[++i];
        } else if (arg === '--identity' && argv[i + 1]) {
            options.identity = argv[++i];
        } else if (arg === '--username' && argv[i + 1]) {
            options.username = argv[++i];
        } else if (arg === '--password' && argv[i + 1]) {
            options.password = argv[++i];
        }
    }

    return options;
}
