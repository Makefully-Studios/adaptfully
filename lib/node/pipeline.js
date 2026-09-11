import path from 'node:path';
import { loadProjectConfig, resolveServerUrl, resolveAccessToken, resolveEncryptFlag } from './config.js';
import { send } from './deploy.js';
import {
    buildOutputDir,
    parsePlatformList,
    resolveBuildArtifactDir,
    resolveExtractRoot,
} from './artifacts.js';
import { prebuildPlatform } from './prebuild.js';
import {
    resolveBuildCredentialDirs,
    resolveBuildSpec,
    resolveDeploymentsForPlatform,
    resolvePublishDir,
} from './registrations.js';
import { steamPublishFromCli } from './steam-publish.js';
import { googlePublishFromCli } from './google-publish.js';
import { applePublishFromCli } from './apple-publish.js';
import { androidKeystoreFromCli } from './android-keystore.js';
import { appleSigningFromCli } from './apple-signing.js';

/** @typedef {'prebuild' | 'build' | 'deploy' | 'release'} AdaptfullyStage */

const VALID_STAGES = new Set(['prebuild', 'build', 'deploy', 'release']);
const PUBLISH_COMMANDS = {
    'steam-publish': steamPublishFromCli,
    'google-publish': googlePublishFromCli,
    'apple-publish': applePublishFromCli,
    'android-keystore': androidKeystoreFromCli,
    'apple-signing': appleSigningFromCli,
};

/**
 * Wrapfully URL path segment for build/release.
 * Single-target platforms post to the target route (`android`, `ios`, …) so OS relay
 * and long-standing target routes work; multi-target platforms post to the family
 * (`electron`, …).
 *
 * @param {{ family: string, targets: string[] }} buildSpec
 */
export function resolveWrapfullyRoute(buildSpec) {
    if (buildSpec.targets.length === 1) {
        return buildSpec.targets[0];
    }
    return buildSpec.family;
}

/**
 * @param {AdaptfullyStage} stage
 * @param {string} platformKey
 * @param {{ pkg: object, deployFolder: string, server?: string, mode?: string, deployment?: string, artifactPath?: string, log?: (message: string) => void, outputRoot?: string, accessToken?: string, encrypt?: boolean, encryptPublicKey?: string, wrapfullyConfig?: object, extractRoot?: string, multiPlatform?: boolean }} options
 */
export async function runAdaptfullyStage(stage, platformKey, options) {
    if (!VALID_STAGES.has(stage)) {
        throw new Error(`Unknown adaptfully stage "${stage}". Expected: prebuild, build, deploy, or release.`);
    }

    const log = options.log ?? console.log;
    const { pkg, deployFolder } = options;
    const buildSpec = resolveBuildSpec(platformKey, pkg);
    let deployments = resolveDeploymentsForPlatform(platformKey, pkg);
    const outputRoot = buildOutputDir(pkg, options.outputRoot);
    const extractRoot = options.extractRoot
        ?? resolveExtractRoot(outputRoot, platformKey, { multiPlatform: options.multiPlatform === true });

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
            multiPlatform: options.multiPlatform,
        });
    }

    const prebuiltDir = stage === 'deploy'
        ? artifactPath
        : prebuildPlatform(deployFolder, platformKey, pkg, {
            log,
            outputRoot: options.outputRoot,
        });

    if (stage === 'prebuild') {
        return { prebuiltDir, platformKey, buildSpec, extractRoot };
    }

    const gameId = `${pkg.name}-${pkg.version}`;
    const contents = JSON.stringify(pkg);
    /** @type {{ deploymentKey: string, stage: string, family: string }[]} */
    const sent = [];

    const wrapfullyRoute = resolveWrapfullyRoute(buildSpec);
    const sendOptionsBase = {
        log,
        platformKey,
        accessToken: options.accessToken,
        encrypt: options.encrypt,
        encryptPublicKey: options.encryptPublicKey,
        wrapfullyConfig: options.wrapfullyConfig,
        extractRoot,
    };

    if (stage === 'release') {
        const deploymentDirs = deployments.map((key) => resolvePublishDir(key));

        log(
            `adaptfully: ${stage} ${platformKey} → ${buildSpec.family} `
            + `(${buildSpec.targets.join(', ')}) via Yap /yap/wrapfully (route ${wrapfullyRoute}/release)`,
        );

        log(
            `adaptfully: release deployments → ${
                deploymentDirs.map((dir) => path.resolve(dir)).join(', ') || '(none)'
            }`,
        );
        log(`adaptfully: extract → ${extractRoot}`);

        await send(
            gameId,
            contents,
            options.server,
            'release',
            wrapfullyRoute,
            prebuiltDir,
            pkg,
            options.mode ?? 'extract',
            {
                ...sendOptionsBase,
                deploymentDirs: deploymentDirs.map((dir) => path.resolve(dir)),
            },
        );

        sent.push({ deploymentKey: 'release', stage, family: buildSpec.family });
        return { prebuiltDir, platformKey, buildSpec, deployments: sent, artifactPath, extractRoot };
    }

    for (const deploymentKey of deployments) {
        const publishDir = deploymentKey === 'zip' ? undefined : resolvePublishDir(deploymentKey);
        const wrapStage = stage === 'deploy' ? 'deploy' : 'build';
        const deploymentDirs = wrapStage === 'build'
            ? resolveBuildCredentialDirs(platformKey, pkg)
            : [];

        log(
            `adaptfully: ${stage} ${platformKey} → `
            + `${deploymentKey === 'zip' ? 'artifact zip' : `deployment "${deploymentKey}"`} `
            + `via Yap /yap/wrapfully (route ${wrapfullyRoute}/${wrapStage}, ${buildSpec.family})`,
        );

        if (deploymentDirs.length) {
            log(
                `adaptfully: build signing credentials → ${
                    deploymentDirs.map((dir) => path.resolve(dir)).join(', ')
                }`,
            );
        }
        log(`adaptfully: extract → ${extractRoot}`);

        await send(
            gameId,
            contents,
            options.server,
            wrapStage,
            wrapfullyRoute,
            prebuiltDir,
            pkg,
            options.mode ?? 'extract',
            {
                ...sendOptionsBase,
                publishDir,
                deploymentDirs,
                deploymentKey: wrapStage === 'deploy' ? deploymentKey : undefined,
                artifactPath,
            },
        );

        sent.push({ deploymentKey, stage: wrapStage, family: buildSpec.family });
    }

    return { prebuiltDir, platformKey, buildSpec, deployments: sent, artifactPath, extractRoot };
}

/**
 * Run a stage for one or more platforms sequentially.
 * Multi-platform extracts land in `output/<platformKey>/` so outputs do not overwrite.
 *
 * @param {AdaptfullyStage} stage
 * @param {string[]} platformKeys
 * @param {Parameters<typeof runAdaptfullyStage>[2]} options
 */
export async function runAdaptfullyStages(stage, platformKeys, options) {
    const log = options.log ?? console.log;
    const multiPlatform = platformKeys.length > 1;
    /** @type {{ platformKey: string, ok: boolean, result?: object, error?: Error }[]} */
    const results = [];

    if (multiPlatform) {
        log(`adaptfully: sequential ${stage} for ${platformKeys.join(', ')}`);
    }

    for (const platformKey of platformKeys) {
        log(`adaptfully: ——— ${stage} ${platformKey} ———`);
        try {
            const result = await runAdaptfullyStage(stage, platformKey, {
                ...options,
                multiPlatform,
            });
            results.push({ platformKey, ok: true, result });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`adaptfully: ${stage} ${platformKey} failed: ${error.message}`);
            results.push({ platformKey, ok: false, error });
        }
    }

    const failed = results.filter((entry) => !entry.ok);
    if (failed.length) {
        throw new Error(
            `adaptfully: ${failed.length}/${results.length} platform(s) failed: `
            + failed.map((entry) => entry.platformKey).join(', '),
        );
    }

    return results;
}

/**
 * @param {string[]} [argv=process.argv]
 */
export async function adaptfullyFromCli(argv = process.argv) {
    const command = argv[2];

    if (command === 'steam-auth') {
        console.warn('adaptfully: "steam-auth" CLI is deprecated; use "steam-publish" instead.');
        return steamPublishFromCli(argv);
    }

    if (PUBLISH_COMMANDS[command]) {
        return PUBLISH_COMMANDS[command](argv);
    }

    const stage = command;
    const {
        positionals,
        deployment,
        artifactPath,
        encrypt,
        encryptPublicKey,
        platforms,
    } = parseStageArgs(argv.slice(3));
    const platformArg = platforms || positionals[0];
    const cliServer = platforms ? positionals[0] : positionals[1];
    const mode = platforms ? (positionals[1] ?? 'extract') : (positionals[2] ?? 'extract');

    if (!stage || !platformArg) {
        throw new Error(
            'Usage:\n'
            + '  adaptfully <prebuild|build|deploy|release> <platform[,platform...]> [showfullyServer] [mode]\n'
            + '    [--platforms a,b,c] [--deployment <key>] [--artifact <path>] [--encrypt] [--encrypt-public-key <pem|path>]\n'
            + '  adaptfully steam-publish [--username U] [--password P] [--deployment steam] [--output path]\n'
            + '  adaptfully google-publish [--from service-account.json] [--deployment android] [--output path]\n'
            + '  adaptfully apple-publish [--deployment ios] [--category C] [--identity I] [--username U] [--password P]\n'
            + '  adaptfully android-keystore [--deployment android] [--debug-only] [--yes]\n'
            + '  adaptfully apple-signing [--deployment ios] [--kind development|distribution] [--csr-only] [--from-cer path] [--provision path]\n'
            + '\n'
            + 'Stages:\n'
            + '  prebuild  Copy deploy/ and apply platform registrations → output/<platform>-prebuild/\n'
            + '  build     prebuild + POST /yap/wrapfully (zip artifact only; Showfully PAT required)\n'
            + '  deploy    Yap deploy chore with prior artifact + deployment credentials\n'
            + '  release   Yap release chore (build + configured deployments)\n'
            + '\n'
            + '  Multiple platforms (comma-separated or --platforms) run sequentially.\n'
            + '  Multi-platform extracts go to output/<platform>/ so siblings are preserved.\n'
            + '\n'
            + '  --deployment <key>  Target a single named deployment.\n'
            + '  --artifact <path>   Prior build artifact directory (deploy only; default: ./output/ after build).\n'
            + '  --encrypt           Envelope-encrypt chore to Wrapfully (optional; default key embedded).\n'
            + '  --encrypt-public-key <pem|path>  Override Wrapfully public key when encrypting.\n'
            + '\n'
            + 'Auth / server (wrapfully.json or env):\n'
            + '  SHOWFULLY_PAT / accessToken   required PAT from play.makefullystudios.com Settings\n'
            + '  SHOWFULLY_SERVER / server     Showfully Yap base (default https://make.makefullystudios.com/)\n'
            + '\n'
            + 'Publish credential helpers (one-time local setup):\n'
            + '  steam-publish     Install steamcmd if needed, log in, write steam deployment steam.json\n'
            + '  google-publish    Import a Play service-account JSON into the android deployment folder\n'
            + '  apple-publish     Write App Store Connect credentials into the ios deployment folder\n'
            + '  android-keystore  Generate debug/release keystores and write android build.json\n'
            + '  apple-signing     Generate CSR, export .p12, place provisioning profiles under ios/apple/',
        );
    }

    const platformKeys = parsePlatformList(platformArg);
    if (!platformKeys.length) {
        throw new Error('At least one platform is required.');
    }

    const { pkg, wrapfullyConfig } = await loadProjectConfig();
    const server = resolveServerUrl(wrapfullyConfig, cliServer);
    const accessToken = resolveAccessToken(wrapfullyConfig);
    const encryptFlag = resolveEncryptFlag(wrapfullyConfig, encrypt);
    const deployFolder = pkg.config?.deployFolder || 'deploy';

    return runAdaptfullyStages(/** @type {AdaptfullyStage} */ (stage), platformKeys, {
        pkg,
        deployFolder,
        server,
        mode,
        deployment,
        artifactPath,
        accessToken,
        encrypt: encryptFlag,
        encryptPublicKey,
        wrapfullyConfig,
    });
}

/**
 * @param {string[]} args
 * @returns {{ positionals: string[], deployment?: string, artifactPath?: string, encrypt?: boolean, encryptPublicKey?: string, platforms?: string }}
 */
export function parseStageArgs(args) {
    /** @type {string[]} */
    const positionals = [];
    let deployment;
    let artifactPath;
    let encrypt;
    let encryptPublicKey;
    let platforms;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--deployment' && args[i + 1]) {
            deployment = args[++i];
        } else if (arg.startsWith('--deployment=')) {
            deployment = arg.slice('--deployment='.length);
        } else if (arg === '--platforms' && args[i + 1]) {
            platforms = args[++i];
        } else if (arg.startsWith('--platforms=')) {
            platforms = arg.slice('--platforms='.length);
        } else if (arg === '--artifact' && args[i + 1]) {
            artifactPath = args[++i];
        } else if (arg.startsWith('--artifact=')) {
            artifactPath = arg.slice('--artifact='.length);
        } else if (arg === '--encrypt') {
            encrypt = true;
        } else if (arg === '--encrypt-public-key' && args[i + 1]) {
            encryptPublicKey = args[++i];
        } else if (arg.startsWith('--encrypt-public-key=')) {
            encryptPublicKey = arg.slice('--encrypt-public-key='.length);
        } else {
            positionals.push(arg);
        }
    }

    return { positionals, deployment, artifactPath, encrypt, encryptPublicKey, platforms };
}
