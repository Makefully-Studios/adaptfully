import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    buildAndroidBuildJson,
    defaultAndroidDeploymentDir,
    runAndroidKeystore,
} from '../lib/node/android-keystore.js';
import {
    appleSigningFilenames,
    defaultAppleSigningDir,
    generateAppleCsr,
    mergeAppleP12PasswordBuildJson,
    normalizeAppleSigningKind,
    runAppleSigning,
} from '../lib/node/apple-signing.js';
import { parsePublishCredentialArgv } from '../lib/node/publish-credentials.js';

describe('android-keystore', () => {
    it('builds default android build.json with debug and release', () => {
        const json = buildAndroidBuildJson({
            release: {
                keystore: './android/release.keystore',
                storePassword: 'secret',
                alias: 'upload',
                password: 'secret',
            },
        });
        assert.equal(json.android.debug.alias, 'androiddebugkey');
        assert.equal(json.android.release.alias, 'upload');
        assert.equal(json.android.release.packageType, 'bundle');
    });

    it('omits release when debugOnly', () => {
        const json = buildAndroidBuildJson({ debugOnly: true });
        assert.ok(json.android.debug);
        assert.equal(json.android.release, undefined);
    });

    it('writes keystores and build.json with mocked keytool', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-android-ks-'));
        const calls = [];

        const result = await runAndroidKeystore({
            projectRoot: tmp,
            deployment: 'android',
            debugOnly: true,
            yes: true,
            log: () => {},
            runKeytoolFn: async (args) => {
                calls.push(args);
                const keystoreIdx = args.indexOf('-keystore');
                const keystorePath = args[keystoreIdx + 1];
                await fsp.mkdir(path.dirname(keystorePath), { recursive: true });
                await fsp.writeFile(keystorePath, 'fake-keystore');
            },
        });

        assert.equal(calls.length, 1);
        assert.equal(result.debugOnly, true);
        assert.ok(fs.existsSync(result.buildJsonPath));
        const written = JSON.parse(fs.readFileSync(result.buildJsonPath, 'utf8'));
        assert.equal(written.android.debug.keystore, './android/debug.keystore');
        assert.ok(
            fs.existsSync(path.join(defaultAndroidDeploymentDir(tmp, 'android'), 'android', 'debug.keystore')),
        );
    });
});

describe('apple-signing', () => {
    it('normalizes signing kinds', () => {
        assert.equal(normalizeAppleSigningKind('dev'), 'development');
        assert.equal(normalizeAppleSigningKind('app-store'), 'distribution');
        assert.throws(() => normalizeAppleSigningKind('other'));
    });

    it('maps filenames for development and distribution', () => {
        assert.equal(appleSigningFilenames('development').p12, 'development.p12');
        assert.equal(appleSigningFilenames('distribution').provision, 'app-store.mobileprovision');
    });

    it('merges apple.p12Password into build.json', () => {
        const merged = mergeAppleP12PasswordBuildJson({ android: { debug: {} } }, 'pass');
        assert.equal(merged.apple.p12Password, 'pass');
        assert.ok(merged.android.debug);
    });

    it('generates CSR with mocked openssl', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-apple-csr-'));
        const workdir = path.join(tmp, 'work');
        const calls = [];

        const result = await generateAppleCsr({
            workdir,
            cn: 'Test Dev',
            email: 'dev@example.com',
            runOpensslFn: async (args) => {
                calls.push(args);
                if (args[0] === 'genrsa') {
                    await fsp.mkdir(workdir, { recursive: true });
                    await fsp.writeFile(args[2], 'key');
                }
                if (args[0] === 'req') {
                    const outIdx = args.indexOf('-out');
                    await fsp.writeFile(args[outIdx + 1], 'csr');
                }
            },
        });

        assert.equal(calls.length, 2);
        assert.ok(fs.existsSync(result.csrPath));
        assert.ok(fs.existsSync(result.keyPath));
    });

    it('csr-only flow writes workdir files and stops', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-apple-sign-'));
        const result = await runAppleSigning({
            projectRoot: tmp,
            deployment: 'ios',
            csrOnly: true,
            kind: 'development',
            cn: 'Test',
            yes: true,
            log: () => {},
            runOpensslFn: async (args) => {
                if (args[0] === 'genrsa') {
                    await fsp.mkdir(path.dirname(args[2]), { recursive: true });
                    await fsp.writeFile(args[2], 'key');
                }
                if (args[0] === 'req') {
                    const outIdx = args.indexOf('-out');
                    await fsp.writeFile(args[outIdx + 1], 'csr');
                }
            },
        });

        assert.equal(result.csrOnly, true);
        assert.ok(fs.existsSync(result.csrPath));
        assert.equal(defaultAppleSigningDir(tmp, 'ios'), result.appleDir);
    });
});

describe('parsePublishCredentialArgv extras', () => {
    it('parses signing helper flags', () => {
        const options = parsePublishCredentialArgv([
            'node', 'adaptfully', 'apple-signing',
            '--debug-only',
            '--csr-only',
            '--yes',
            '--kind', 'development',
            '--from-cer', './cert.cer',
            '--provision', './profile.mobileprovision',
            '--p12-password', 'secret',
        ]);
        assert.equal(options.debugOnly, true);
        assert.equal(options.csrOnly, true);
        assert.equal(options.yes, true);
        assert.equal(options.kind, 'development');
        assert.equal(options.fromCer, './cert.cer');
        assert.equal(options.provision, './profile.mobileprovision');
        assert.equal(options.p12Password, 'secret');
    });
});
