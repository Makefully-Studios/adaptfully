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
    resolveUserPath,
} from './publish-credentials.js';

/** @typedef {'development' | 'distribution'} AppleSigningKind */

/**
 * @param {string} [projectRoot]
 * @param {string} [deploymentKey='ios']
 */
export function defaultAppleSigningDir(projectRoot = '.', deploymentKey = 'ios') {
    return path.join(
        path.dirname(defaultDeploymentCredentialPath(projectRoot, deploymentKey, 'apple.json')),
        'apple',
    );
}

/**
 * @param {string} kind
 * @returns {AppleSigningKind}
 */
export function normalizeAppleSigningKind(kind) {
    const value = String(kind ?? '').trim().toLowerCase();
    if (value === 'development' || value === 'dev' || value === 'debug') {
        return 'development';
    }
    if (value === 'distribution' || value === 'dist' || value === 'release' || value === 'app-store') {
        return 'distribution';
    }
    throw new Error(
        `Unknown Apple signing kind "${kind}". Use "development" or "distribution".`,
    );
}

/**
 * @param {AppleSigningKind} kind
 */
export function appleSigningFilenames(kind) {
    if (kind === 'development') {
        return {
            p12: 'development.p12',
            provision: 'development.mobileprovision',
            certLabel: 'Apple Development',
        };
    }
    return {
        p12: 'distribution.p12',
        provision: 'app-store.mobileprovision',
        certLabel: 'Apple Distribution',
    };
}

/**
 * Merge or create build.json with apple.p12Password.
 * @param {object | null | undefined} existing
 * @param {string} p12Password
 */
export function mergeAppleP12PasswordBuildJson(existing, p12Password) {
    /** @type {Record<string, unknown>} */
    const next = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...existing }
        : {};
    const apple = next.apple && typeof next.apple === 'object' && !Array.isArray(next.apple)
        ? { .../** @type {Record<string, unknown>} */ (next.apple) }
        : {};
    apple.p12Password = p12Password;
    next.apple = apple;
    return next;
}

/**
 * @param {string[]} args
 * @param {{ command?: string }} [options]
 * @returns {Promise<void>}
 */
export function runOpenssl(args, options = {}) {
    const command = options.command ?? 'openssl';

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
                `Unable to run "${command}". Install OpenSSL and ensure it is on PATH. (${err.message})`,
            ));
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`openssl failed (exit ${code}): ${stderr.trim() || 'no output'}`));
        });
    });
}

/**
 * @param {{
 *   workdir: string,
 *   cn: string,
 *   email?: string,
 *   runOpensslFn?: typeof runOpenssl,
 * }} options
 */
export async function generateAppleCsr(options) {
    const run = options.runOpensslFn ?? runOpenssl;
    await fsp.mkdir(options.workdir, { recursive: true });

    const keyPath = path.join(options.workdir, 'private.key');
    const csrPath = path.join(options.workdir, 'CertificateSigningRequest.certSigningRequest');
    const subject = options.email
        ? `/emailAddress=${options.email}/CN=${options.cn}/C=US`
        : `/CN=${options.cn}/C=US`;

    await run(['genrsa', '-out', keyPath, '2048']);
    await run([
        'req',
        '-new',
        '-key', keyPath,
        '-out', csrPath,
        '-subj', subject,
    ]);

    return { keyPath, csrPath };
}

/**
 * @param {{
 *   cerPath: string,
 *   keyPath: string,
 *   p12Path: string,
 *   p12Password: string,
 *   runOpensslFn?: typeof runOpenssl,
 * }} options
 */
export async function exportAppleP12(options) {
    const run = options.runOpensslFn ?? runOpenssl;
    await fsp.mkdir(path.dirname(options.p12Path), { recursive: true });

    const pemPath = `${options.cerPath}.pem`;
    await run(['x509', '-in', options.cerPath, '-inform', 'DER', '-out', pemPath, '-outform', 'PEM']);

    try {
        await run([
            'pkcs12',
            '-export',
            '-inkey', options.keyPath,
            '-in', pemPath,
            '-out', options.p12Path,
            '-passout', `pass:${options.p12Password}`,
        ]);
    } catch (derErr) {
        // Some downloads are already PEM
        try {
            await run([
                'pkcs12',
                '-export',
                '-inkey', options.keyPath,
                '-in', options.cerPath,
                '-out', options.p12Path,
                '-passout', `pass:${options.p12Password}`,
            ]);
        } catch {
            throw derErr;
        }
    } finally {
        try {
            await fsp.unlink(pemPath);
        } catch {
            // ignore
        }
    }
}

/**
 * @param {(message: string) => void} log
 * @param {AppleSigningKind} kind
 * @param {string} csrPath
 */
function printPortalChecklist(log, kind, csrPath) {
    const names = appleSigningFilenames(kind);
    log('');
    log('adaptfully: Apple Developer portal steps (browser):');
    log(`  1. Open https://developer.apple.com/account/resources/certificates/list`);
    log(`  2. Create a new "${names.certLabel}" certificate`);
    log(`  3. Upload CSR: ${csrPath}`);
    log('  4. Download the .cer file');
    log('  5. Ensure your App ID exists; enable Sign in with Apple if you use Capgo Apple auth');
    if (kind === 'development') {
        log('  6. Register device UDIDs, then create a Development provisioning profile');
    } else {
        log('  6. Create an App Store Connect provisioning profile for the App ID');
    }
    log('  7. Download the .mobileprovision file');
    log('');
}

/**
 * @param {{
 *   deployment?: string,
 *   projectRoot?: string,
 *   workdir?: string,
 *   csrOnly?: boolean,
 *   fromCer?: string,
 *   kind?: string,
 *   provision?: string,
 *   p12Password?: string,
 *   cn?: string,
 *   email?: string,
 *   yes?: boolean,
 *   log?: (message: string) => void,
 *   runOpensslFn?: typeof runOpenssl,
 * }} [options]
 */
export async function runAppleSigning(options = {}) {
    const log = options.log ?? console.log;
    const projectRoot = options.projectRoot ?? '.';
    const deploymentKey = options.deployment ?? 'ios';
    const appleDir = defaultAppleSigningDir(projectRoot, deploymentKey);
    const deploymentDir = path.dirname(appleDir);
    const workdir = path.resolve(
        options.workdir
            ?? path.join(appleDir, '.work'),
    );

    let kind = options.kind
        ? normalizeAppleSigningKind(options.kind)
        : null;

    if (!kind && (options.fromCer || options.provision || !options.csrOnly)) {
        kind = normalizeAppleSigningKind(
            await promptRequired('Signing kind (development|distribution): ', options.kind),
        );
    }

    if (!kind) {
        kind = 'development';
    }

    const names = appleSigningFilenames(kind);
    const keyPath = path.join(workdir, 'private.key');
    const csrPath = path.join(workdir, 'CertificateSigningRequest.certSigningRequest');

    let createdCsr = false;
    try {
        await fsp.access(keyPath);
        await fsp.access(csrPath);
    } catch {
        const cn = options.cn ?? await promptRequired('Common name for CSR (e.g. Your Name): ');
        const email = options.email;
        log(`adaptfully: generating CSR in ${workdir}`);
        await generateAppleCsr({
            workdir,
            cn,
            email,
            runOpensslFn: options.runOpensslFn,
        });
        createdCsr = true;
    }

    printPortalChecklist(log, kind, csrPath);

    if (options.csrOnly) {
        await ensurePublishCredentialsGitignore(projectRoot, {
            extraPaths: [appleDir],
            log,
        });
        log('adaptfully: --csr-only set; stop here, then re-run with --from-cer after downloading the .cer');
        return {
            deploymentKey,
            appleDir,
            workdir,
            csrPath,
            keyPath,
            kind,
            csrOnly: true,
            createdCsr,
        };
    }

    const cerPath = resolveUserPath(
        await promptRequired('Path to downloaded Apple .cer: ', options.fromCer),
    );

    const p12Password = options.p12Password != null
        ? String(options.p12Password)
        : await promptRequired('Passphrase for the .p12 (remember this for build.json apple.p12Password): ');

    const p12Path = path.join(appleDir, names.p12);
    log(`adaptfully: exporting ${p12Path}`);
    await exportAppleP12({
        cerPath,
        keyPath,
        p12Path,
        p12Password,
        runOpensslFn: options.runOpensslFn,
    });

    const buildJsonPath = path.join(deploymentDir, 'build.json');
    let existingBuild = null;
    try {
        existingBuild = JSON.parse(await fsp.readFile(buildJsonPath, 'utf8'));
    } catch {
        existingBuild = null;
    }

    const writePassword = options.yes === true
        || p12Password === ''
        || await promptConfirm(
            `Write apple.p12Password into ${buildJsonPath}?`,
            true,
        );

    if (writePassword) {
        const merged = mergeAppleP12PasswordBuildJson(existingBuild, p12Password);
        await fsp.mkdir(deploymentDir, { recursive: true });
        await fsp.writeFile(buildJsonPath, `${JSON.stringify(merged, null, 4)}\n`);
        log(`adaptfully: wrote ${buildJsonPath}`);
    }

    let provisionPath = options.provision;
    if (!provisionPath) {
        if (options.yes === true) {
            log(`adaptfully: --yes set without --provision; skipping provisioning profile copy`);
        } else {
            const rlAnswer = await promptRequired(
                `Path to downloaded ${names.provision} (type skip to finish later): `,
            );
            if (rlAnswer.toLowerCase() !== 'skip') {
                provisionPath = rlAnswer;
            }
        }
    }

    if (provisionPath) {
        const dest = path.join(appleDir, names.provision);
        await fsp.mkdir(appleDir, { recursive: true });
        await fsp.copyFile(resolveUserPath(provisionPath), dest);
        log(`adaptfully: copied provisioning profile → ${dest}`);
    } else {
        log(`adaptfully: skipped provisioning profile — place ${names.provision} under ${appleDir} when ready`);
    }

    await ensureDeploymentManifest(deploymentDir, 'apple', log);
    await ensurePublishCredentialsGitignore(projectRoot, {
        extraPaths: [appleDir, buildJsonPath],
        log,
    });

    log(`adaptfully: signing files under ${appleDir}`);
    if (kind === 'distribution') {
        log('adaptfully: next for App Store upload — adaptfully apple-publish');
    } else {
        log('adaptfully: development signing ready for ios-dev device builds');
    }

    return {
        deploymentKey,
        appleDir,
        workdir,
        csrPath,
        keyPath,
        p12Path,
        kind,
        csrOnly: false,
        createdCsr,
        provisionPath: provisionPath ? resolveUserPath(provisionPath) : null,
    };
}

/**
 * @param {string[]} [argv]
 */
export async function appleSigningFromCli(argv = process.argv) {
    return runAppleSigning(parsePublishCredentialArgv(argv));
}
