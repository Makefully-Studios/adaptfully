import fs from 'node:fs';
import path from 'node:path';

const
    MANIFEST_NAME = 'wrapfully-build.json',
    STATUS_NAME = 'wrapfully-status.json';

/**
 * Directory where build responses are extracted (contains wrapfully-build.json).
 *
 * @param {{ config?: { outputFolder?: string } }} pkg
 * @param {string} [outputRoot='output']
 */
export function buildOutputDir(pkg, outputRoot = 'output') {
    const outputFolder = pkg.config?.outputFolder || outputRoot;
    return path.resolve(outputFolder);
}

/**
 * Where a platform's Wrapfully zip is extracted: always `output/<platformKey>/`
 * so sequential single-platform and multi-platform runs share one layout.
 * Without a platform key, falls back to `outputRoot`.
 *
 * @param {string} outputRoot
 * @param {string} [platformKey]
 * @returns {string}
 */
export function resolveExtractRoot(outputRoot, platformKey) {
    const root = path.resolve(outputRoot);
    if (platformKey) {
        return path.join(root, platformKey);
    }
    return root;
}

/**
 * Remove prior extract artifacts in `extractRoot` only (artifacts/, status,
 * manifest). Does not wipe sibling platform folders under output/.
 *
 * @param {string} [extractRoot='output']
 */
export function clearStaleBuildExtract(extractRoot = 'output') {
    const root = path.resolve(extractRoot);
    const stalePaths = [
        path.join(root, 'artifacts'),
        path.join(root, MANIFEST_NAME),
        path.join(root, STATUS_NAME),
    ];

    for (const stalePath of stalePaths) {
        fs.rmSync(stalePath, { recursive: true, force: true });
    }
}

/**
 * Resolve the artifact directory from a prior `adaptfully build` (or compatible zip extract).
 * Prefers `output/<platform>/`; still accepts a legacy flat `output/` extract.
 *
 * @param {{ name: string, version: string, config?: { outputFolder?: string } }} pkg
 * @param {{ outputRoot?: string, platformKey?: string }} [options]
 * @returns {string}
 */
export function resolveBuildArtifactDir(pkg, options = {}) {
    const outputRoot = buildOutputDir(pkg, options.outputRoot);
    const candidates = [];

    if (options.platformKey) {
        candidates.push(resolveExtractRoot(outputRoot, options.platformKey));
    }
    candidates.push(outputRoot);

    let artifactDir = null;
    let manifestPath = null;

    for (const candidate of candidates) {
        const candidateManifest = path.join(candidate, MANIFEST_NAME);
        if (fs.existsSync(candidateManifest)) {
            artifactDir = candidate;
            manifestPath = candidateManifest;
            break;
        }
    }

    if (!artifactDir || !manifestPath) {
        throw new Error(
            'No prior build artifact found in '
            + `${candidates.join(' or ')}. Run \`adaptfully build <platform>\` first or pass --artifact <path>.`,
        );
    }

    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        throw new Error(`Unable to read ${manifestPath}`);
    }

    const gameId = `${pkg.name}-${pkg.version}`;
    if (manifest.gameId && manifest.gameId !== gameId) {
        throw new Error(
            `Build artifact is for "${manifest.gameId}" but package.json is ${gameId}. `
            + 'Run a fresh build or pass --artifact <path>.',
        );
    }

    if (options.platformKey && manifest.platformKey && manifest.platformKey !== options.platformKey) {
        throw new Error(
            `Build artifact is for platform "${manifest.platformKey}" but deploy targets "${options.platformKey}". `
            + 'Run a fresh build or pass --artifact <path>.',
        );
    }

    return artifactDir;
}

/**
 * @param {string} value
 * @returns {string[]}
 */
export function parsePlatformList(value) {
    return String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
