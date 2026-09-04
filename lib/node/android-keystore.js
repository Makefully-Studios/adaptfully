import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
    defaultDeploymentCredentialPath,
    ensureDeploymentManifest,
    ensurePublishCredentialsGitignore,
    parsePublishCredentialArgv,
    promptConfirm,
    promptRequired,
} from './publish-credentials.js';

const DEBUG_ALIAS = 'androiddebugkey';
const DEBUG_PASSWORD = 'android';
const DEBUG_DNAME = 'CN=Android Debug,O=Android,C=US';

/**
 * @param {string} [projectRoot]
 * @param {string} [deploymentKey='android']
 */
export function defaultAndroidDeploymentDir(projectRoot = '.', deploymentKey = 'android') {
    return path.dirname(defaultDeploymentCredentialPath(projectRoot, deploymentKey, 'build.json'));
}

/**
 * @param {{
 *   debugOnly?: boolean,
 *   debug?: { keystore: string, storePassword: string, alias: string, password: string },
 *   release?: { keystore: string, storePassword: string, alias: string, password: string },
 * }} options
 */
export function buildAndroidBuildJson(options = {}) {
    /** @type {Record<string, unknown>} */
    const android = {
        debug: {
            keystore: options.debug?.keystore ?? './android/debug.keystore',
            packageType: 'apk',
            storePassword: options.debug?.storePassword ?? DEBUG_PASSWORD,
            alias: options.debug?.alias ?? DEBUG_ALIAS,
            password: options.debug?.password ?? DEBUG_PASSWORD,
            keystoreType: '',
        },
    };

    if (!options.debugOnly && options.release) {
        android.release = {
            keystore: options.release.keystore,
            packageType: 'bundle',
            storePassword: options.release.storePassword,
            alias: options.release.alias,
            password: options.release.password,
            keystoreType: '',
        };
    }

    return { android };
}

/**
 * @param {string[]} args
 * @param {{ command?: string }} [options]
 * @returns {Promise<void>}
 */
export function runKeytool(args, options = {}) {
    const command = options.command ?? 'keytool';

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });

        let stderr = '';
        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', (err) => {
            reject(new Error(
                `Unable to run "${command}". Install a JDK and ensure keytool is on PATH. (${err.message})`,
            ));
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`keytool failed (exit ${code}): ${stderr.trim() || 'no output'}`));
        });
    });
}

/**
 * @param {{
 *   keystorePath: string,
 *   alias: string,
 *   storePassword: string,
 *   keyPassword: string,
 *   dname: string,
 *   validityDays?: number,
 *   runKeytoolFn?: typeof runKeytool,
 * }} options
 */
export async function generateKeystore(options) {
    const run = options.runKeytoolFn ?? runKeytool;
    await fsp.mkdir(path.dirname(options.keystorePath), { recursive: true });
    await run([
        '-genkeypair',
        '-v',
        '-keystore', options.keystorePath,
        '-alias', options.alias,
        '-keyalg', 'RSA',
        '-keysize', '2048',
        '-validity', String(options.validityDays ?? 10000),
        '-storepass', options.storePassword,
        '-keypass', options.keyPassword,
        '-dname', options.dname,
    ]);
}

/**
 * @param {{
 *   deployment?: string,
 *   projectRoot?: string,
 *   debugOnly?: boolean,
 *   yes?: boolean,
 *   alias?: string,
 *   storePassword?: string,
 *   keyPassword?: string,
 *   cn?: string,
 *   log?: (message: string) => void,
 *   runKeytoolFn?: typeof runKeytool,
 * }} [options]
 */
export async function runAndroidKeystore(options = {}) {
    const log = options.log ?? console.log;
    const projectRoot = options.projectRoot ?? '.';
    const deploymentKey = options.deployment ?? 'android';
    const deploymentDir = defaultAndroidDeploymentDir(projectRoot, deploymentKey);
    const keystoreDir = path.join(deploymentDir, 'android');
    const buildJsonPath = path.join(deploymentDir, 'build.json');
    const debugOnly = options.debugOnly === true;

    let buildJsonExists = false;
    try {
        await fsp.access(buildJsonPath);
        buildJsonExists = true;
    } catch {
        buildJsonExists = false;
    }

    if (buildJsonExists) {
        const overwrite = options.yes === true
            || await promptConfirm(`Overwrite existing ${buildJsonPath}?`, false);
        if (!overwrite) {
            throw new Error(`Refusing to overwrite ${buildJsonPath}. Pass --yes to overwrite.`);
        }
    }

    const debugKeystorePath = path.join(keystoreDir, 'debug.keystore');
    log(`adaptfully: generating debug keystore → ${debugKeystorePath}`);
    await generateKeystore({
        keystorePath: debugKeystorePath,
        alias: DEBUG_ALIAS,
        storePassword: DEBUG_PASSWORD,
        keyPassword: DEBUG_PASSWORD,
        dname: DEBUG_DNAME,
        runKeytoolFn: options.runKeytoolFn,
    });

    /** @type {{ keystore: string, storePassword: string, alias: string, password: string } | undefined} */
    let release;

    if (!debugOnly) {
        const alias = options.alias
            ?? await promptRequired('Release keystore alias: ');
        const storePassword = options.storePassword
            ?? await promptRequired('Release store password: ');
        const keyPassword = options.keyPassword
            ?? options.storePassword
            ?? await promptRequired('Release key password (often same as store): ');
        const cn = options.cn
            ?? await promptRequired('Certificate CN (e.g. Your Studio): ');

        const releaseKeystorePath = path.join(keystoreDir, 'release.keystore');
        log(`adaptfully: generating release keystore → ${releaseKeystorePath}`);
        await generateKeystore({
            keystorePath: releaseKeystorePath,
            alias,
            storePassword,
            keyPassword,
            dname: `CN=${cn},O=${cn},C=US`,
            runKeytoolFn: options.runKeytoolFn,
        });

        release = {
            keystore: './android/release.keystore',
            storePassword,
            alias,
            password: keyPassword,
        };
    }

    const buildJson = buildAndroidBuildJson({
        debugOnly,
        debug: {
            keystore: './android/debug.keystore',
            storePassword: DEBUG_PASSWORD,
            alias: DEBUG_ALIAS,
            password: DEBUG_PASSWORD,
        },
        release,
    });

    await fsp.mkdir(deploymentDir, { recursive: true });
    await fsp.writeFile(buildJsonPath, `${JSON.stringify(buildJson, null, 4)}\n`);
    await ensureDeploymentManifest(deploymentDir, 'google', log);
    await ensurePublishCredentialsGitignore(projectRoot, {
        extraPaths: [buildJsonPath, keystoreDir],
        log,
    });

    log(`adaptfully: wrote ${buildJsonPath}`);
    if (debugOnly) {
        log('adaptfully: debug-only keystore ready. For Play uploads, re-run without --debug-only, then use google-publish.');
    } else {
        log('adaptfully: next — create a Play Console service account JSON, then: adaptfully google-publish --from <sa.json>');
    }

    return {
        deploymentKey,
        deploymentDir,
        buildJsonPath,
        buildJson,
        debugOnly,
    };
}

/**
 * @param {string[]} [argv]
 */
export async function androidKeystoreFromCli(argv = process.argv) {
    return runAndroidKeystore(parsePublishCredentialArgv(argv));
}
