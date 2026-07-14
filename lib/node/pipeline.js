import path from 'node:path';
import { loadProjectConfig, resolveServerUrl } from './config.js';
import { send } from './deploy.js';
import { resolveBuildArtifactDir } from './artifacts.js';
import { prebuildPlatform } from './prebuild.js';
import {
    resolveBuildSpec,
    resolveDeploymentsForPlatform,
    resolvePublishDir,
} from './registrations.js';
import { steamAuthFromCli } from './steam-auth.js';

/** @typedef {'prebuild' | 'build' | 'deploy' | 'release'} AdaptfullyStage */

const VALID_STAGES = new Set(['prebuild', 'build', 'deploy', 'release']);

/**
 * @param {AdaptfullyStage} stage
 * @param {string} platformKey
 * @param {{ pkg: object, deployFolder: string, server?: string, mode?: string, deployment?: string, artifactPath?: string, log?: (message: string) => void, outputRoot?: string }} options
 */
export async function runAdaptfullyStage(stage, platformKey, options) {
    if (!VALID_STAGES.has(stage)) {
        throw new Error(`Unknown adaptfully stage "${stage}". Expected: prebuild, build, deploy, or release.`);
    }

    const log = options.log ?? console.log;
    const { pkg, deployFolder } = options;
    const buildSpec = resolveBuildSpec(platformKey, pkg);
    let deployments = resolveDeploymentsForPlatform(platformKey, pkg);

    if (options.deployment) {
        if (!deployments.includes(options.deployment)) {
            throw new Error(
                `Deployment "${options.deployment}" is not configured for platform "${platformKey}". `
                + `Available deployments: ${deployments.join(', ')}`,
            );
        }
        deployments = [options.deployment];
    } else if (stage === 'build') {
        deployments = ['zip'];
    } else if (stage === 'deploy') {
        deployments = deployments.filter((key) => key !== 'zip');
    } else if (stage === 'release') {
        deployments = deployments.filter((key) => key !== 'zip');
    }

    let artifactPath = options.artifactPath;
    if (stage === 'deploy' && !artifactPath) {
        artifactPath = resolveBuildArtifactDir(pkg, {
            outputRoot: options.outputRoot,
            platformKey,
        });
    }

    const prebuiltDir = stage === 'deploy'
        ? artifactPath
        : prebuildPlatform(deployFolder, platformKey, pkg, {
            log,
            outputRoot: options.outputRoot,
        });

    if (stage === 'prebuild') {
        return { prebuiltDir, platformKey, buildSpec };
    }

    const gameId = `${pkg.name}-${pkg.version}`;
    const contents = JSON.stringify(pkg);
    /** @type {{ deploymentKey: string, stage: string, family: string }[]} */
    const sent = [];

    if (stage === 'release') {
        const deploymentDirs = deployments.map((key) => resolvePublishDir(key));

        log(`adaptfully: ${stage} ${platformKey} → ${buildSpec.family} (${buildSpec.targets.join(', ')})`);

        log(
            `adaptfully: release deployments → ${
                deploymentDirs.map((dir) => path.resolve(dir)).join(', ') || '(none)'
            }`,
        );

        await send(
            gameId,
            contents,
            options.server,
            'release',
            buildSpec.family,
            prebuiltDir,
            pkg,
            options.mode ?? 'extract',
            {
                log,
                platformKey,
                deploymentDirs: deploymentDirs.map((dir) => path.resolve(dir)),
            },
        );

        sent.push({ deploymentKey: 'release', stage, family: buildSpec.family });
        return { prebuiltDir, platformKey, buildSpec, deployments: sent, artifactPath };
    }

    for (const deploymentKey of deployments) {
        const publishDir = deploymentKey === 'zip' ? undefined : resolvePublishDir(deploymentKey);
        const wrapStage = stage === 'deploy' ? 'deploy' : 'build';

        log(
            `adaptfully: ${stage} ${platformKey} → `
            + `${deploymentKey === 'zip' ? 'artifact zip' : `deployment "${deploymentKey}"`} `
            + `via Wrapfully ${buildSpec.family}`,
        );

        await send(
            gameId,
            contents,
            options.server,
            wrapStage,
            buildSpec.family,
            prebuiltDir,
            pkg,
            options.mode ?? 'extract',
            {
                log,
                publishDir,
                platformKey,
                deploymentKey: wrapStage === 'deploy' ? deploymentKey : undefined,
                artifactPath,
            },
        );

        sent.push({ deploymentKey, stage: wrapStage, family: buildSpec.family });
    }

    return { prebuiltDir, platformKey, buildSpec, deployments: sent, artifactPath };
}

/**
 * @param {string[]} [argv=process.argv]
 */
export async function adaptfullyFromCli(argv = process.argv) {
    const command = argv[2];

    if (command === 'steam-auth') {
        return steamAuthFromCli(argv);
    }

    const stage = command;
    const { positionals, deployment, artifactPath } = parseStageArgs(argv.slice(3));
    const platformKey = positionals[0];
    const cliServer = positionals[1];
    const mode = positionals[2] ?? 'extract';

    if (!stage || !platformKey) {
        throw new Error(
            'Usage:\n'
            + '  adaptfully <prebuild|build|deploy|release> <platform> [server] [mode] [--deployment <key>] [--artifact <path>]\n'
            + '  adaptfully steam-auth [--username U] [--password P] [--output path]\n'
            + '\n'
            + 'Stages:\n'
            + '  prebuild  Copy deploy/ and apply platform registrations → output/<platform>-prebuild/\n'
            + '  build     prebuild + POST /{family}/build (zip artifact only)\n'
            + '  deploy    POST /deploy/{key} with prior artifact + deployment credentials\n'
            + '  release   prebuild + POST /{family}/release (build + configured deployments)\n'
            + '\n'
            + '  --deployment <key>  Target a single named deployment.\n'
            + '  --artifact <path>   Prior build artifact directory (deploy only; default: ./output/ after build).\n'
            + '\n'
            + '  steam-auth  Install steamcmd if needed, log in interactively, write steam deployment steam.json',
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
        deployment,
        artifactPath,
    });
}

/**
 * @param {string[]} args
 * @returns {{ positionals: string[], deployment?: string, artifactPath?: string }}
 */
export function parseStageArgs(args) {
    /** @type {string[]} */
    const positionals = [];
    let deployment;
    let artifactPath;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--deployment' && args[i + 1]) {
            deployment = args[++i];
        } else if (arg.startsWith('--deployment=')) {
            deployment = arg.slice('--deployment='.length);
        } else if (arg === '--artifact' && args[i + 1]) {
            artifactPath = args[++i];
        } else if (arg.startsWith('--artifact=')) {
            artifactPath = arg.slice('--artifact='.length);
        } else {
            positionals.push(arg);
        }
    }

    return { positionals, deployment, artifactPath };
}
