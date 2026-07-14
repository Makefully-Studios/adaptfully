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
 * Remove prior Wrapfully extract artifacts so zip responses do not stack
 * nested `artifacts/` directories across runs.
 *
 * @param {string} [outputRoot='output']
 */
export function clearStaleBuildExtract(outputRoot = 'output') {
    const root = path.resolve(outputRoot);
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
 *
 * @param {{ name: string, version: string, config?: { outputFolder?: string } }} pkg
 * @param {{ outputRoot?: string, platformKey?: string }} [options]
 * @returns {string}
 */
export function resolveBuildArtifactDir(pkg, options = {}) {
    const artifactDir = buildOutputDir(pkg, options.outputRoot);
    const manifestPath = path.join(artifactDir, MANIFEST_NAME);

    if (!fs.existsSync(manifestPath)) {
        throw new Error(
            'No prior build artifact found in '
            + `${artifactDir}. Run \`adaptfully build <platform>\` first or pass --artifact <path>.`,
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
