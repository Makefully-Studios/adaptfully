import { loadProjectConfig, resolveServerUrl } from './config.js';
import { send } from './deploy.js';
import { prebuildPlatform } from './prebuild.js';
import { resolveBuilderForPlatform } from './registrations.js';

/** @typedef {'prebuild' | 'build' | 'deploy'} AdaptfullyStage */

const VALID_STAGES = new Set(['prebuild', 'build', 'deploy']);

/**
 * @param {AdaptfullyStage} stage
 * @param {string} platformKey
 * @param {{ pkg: object, deployFolder: string, server?: string, mode?: string, builder?: string, log?: (message: string) => void, outputRoot?: string }} options
 */
export async function runAdaptfullyStage(stage, platformKey, options) {
    if (!VALID_STAGES.has(stage)) {
        throw new Error(`Unknown adaptfully stage "${stage}". Expected: prebuild, build, or deploy.`);
    }

    const log = options.log ?? console.log;
    const { pkg, deployFolder } = options;

    const prebuiltDir = prebuildPlatform(deployFolder, platformKey, pkg, {
        log,
        outputRoot: options.outputRoot,
    });

    if (stage === 'prebuild') {
        return { prebuiltDir, platformKey };
    }

    const builder = options.builder ?? resolveBuilderForPlatform(platformKey, pkg);
    log(`adaptfully: ${stage} ${platformKey} via Wrapfully builder "${builder}"`);

    await send(
        `${pkg.name}-${pkg.version}`,
        JSON.stringify(pkg),
        options.server,
        builder,
        prebuiltDir,
        pkg,
        options.mode ?? 'extract',
        { log },
    );

    return { prebuiltDir, platformKey, builder };
}

/**
 * @param {string[]} [argv=process.argv]
 */
export async function adaptfullyFromCli(argv = process.argv) {
    const stage = argv[2];
    const platformKey = argv[3];
    const cliServer = argv[4];
    const mode = argv[5] ?? 'extract';

    if (!stage || !platformKey) {
        throw new Error(
            'Usage: adaptfully <prebuild|build|deploy> <platform> [server] [mode]\n'
            + '  prebuild  Copy deploy/ and apply platform registrations → output/<platform>-prebuild/\n'
            + '  build     prebuild + zip and send to Wrapfully\n'
            + '  deploy    build + platform release when credentials are present (via Wrapfully)',
        );
    }

    const { pkg, wrapfullyConfig } = await loadProjectConfig();
    const server = resolveServerUrl(wrapfullyConfig, cliServer);
    const deployFolder = pkg.config?.deployFolder || 'deploy';

    return runAdaptfullyStage(/** @type {AdaptfullyStage} */ (stage), platformKey, {
        pkg,
        deployFolder,
        server,
        mode,
    });
}
