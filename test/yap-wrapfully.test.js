import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    resolveAccessToken,
    resolveEncryptFlag,
    resolveServerUrl,
} from '../lib/node/config.js';
import {buildWrapfullyJobConfig} from '../lib/node/deploy.js';
import {
    RESULT_DATA,
    RESULT_KEY,
    aesEncrypt,
    createEnvelopeFromInnerZip,
    decryptResultEnvelopeToFile,
    generateResultKeyPair,
    wrapKey,
} from '../lib/node/choreCrypto.js';
import {extractZipFile, fileLooksLikeZip, zipHasEntries} from '../lib/node/unzip-file.js';

describe('config Yap auth', () => {
    it('resolveAccessToken requires a PAT', () => {
        assert.throws(() => resolveAccessToken({}), /PAT required/);
    });

    it('resolveAccessToken reads wrapfully.json accessToken', () => {
        assert.equal(resolveAccessToken({accessToken: 'sfpat_test'}), 'sfpat_test');
    });

    it('resolveServerUrl prefers SHOWFULLY_SERVER', () => {
        const prev = process.env.SHOWFULLY_SERVER;

        process.env.SHOWFULLY_SERVER = 'http://example.test';
        assert.equal(resolveServerUrl({}), 'http://example.test/');
        if (prev === undefined) {
            delete process.env.SHOWFULLY_SERVER;
        } else {
            process.env.SHOWFULLY_SERVER = prev;
        }
    });

    it('resolveEncryptFlag defaults off', () => {
        assert.equal(resolveEncryptFlag({}), false);
        assert.equal(resolveEncryptFlag({encrypt: true}), true);
        assert.equal(resolveEncryptFlag({encrypt: false}, true), true);
    });
});

describe('wrapfully.json job config', () => {
    it('buildWrapfullyJobConfig includes deploymentKey for deploy', () => {
        const job = buildWrapfullyJobConfig('deploy', 'android', 'g-1.0.0', 'android', 'steam');

        assert.deepEqual(job, {
            stage: 'deploy',
            route: 'android',
            platformKey: 'android',
            gameId: 'g-1.0.0',
            deploymentKey: 'steam',
        });
    });

    it('buildWrapfullyJobConfig omits deploymentKey for build', () => {
        const job = buildWrapfullyJobConfig('build', 'webapp', 'g-1.0.0', 'webapp');

        assert.equal(job.deploymentKey, undefined);
        assert.equal(job.stage, 'build');
    });
});

describe('chore envelope', () => {
    it('createEnvelopeFromInnerZip produces envelope members decryptable by worker key', async () => {
        const worker = generateResultKeyPair();
        const client = generateResultKeyPair();
        const archiver = (await import('archiver')).default;
        const {PassThrough} = await import('node:stream');
        const archive = archiver('zip', {zlib: {level: 0}});
        const pass = new PassThrough();
        const chunks = [];

        archive.pipe(pass);
        pass.on('data', (c) => chunks.push(c));
        const done = new Promise((resolve, reject) => {
            pass.on('end', resolve);
            pass.on('error', reject);
        });
        archive.append('{}', {name: 'package.json'});
        await archive.finalize();
        await done;

        const {zip, resultPriv} = await createEnvelopeFromInnerZip(Buffer.concat(chunks), {
            publicKeyPem: worker.publicKey,
            kid: 'test',
            resultKeyPair: client,
        });

        assert.ok(zip[0] === 0x50 && zip[1] === 0x4b);
        assert.ok(resultPriv.includes('BEGIN PRIVATE KEY'));
        assert.equal(resultPriv, client.privateKey);
    });

    it('decryptResultEnvelopeToFile streams AES-GCM result envelopes to disk', async () => {
        const client = generateResultKeyPair();
        const archiver = (await import('archiver')).default;
        const {PassThrough} = await import('node:stream');
        const inner = archiver('zip', {zlib: {level: 0}});
        const innerPass = new PassThrough();
        const innerChunks = [];

        inner.pipe(innerPass);
        innerPass.on('data', (c) => innerChunks.push(c));
        const innerDone = new Promise((resolve, reject) => {
            innerPass.on('end', resolve);
            innerPass.on('error', reject);
        });
        inner.append('hello-from-disk', {name: 'payload.txt'});
        await inner.finalize();
        await innerDone;

        const plaintextZip = Buffer.concat(innerChunks);
        const {key, ciphertext} = aesEncrypt(plaintextZip);
        const wrapped = wrapKey(key, client.publicKey);
        const envelope = archiver('zip', {zlib: {level: 0}});
        const envPass = new PassThrough();
        const envChunks = [];

        envelope.pipe(envPass);
        envPass.on('data', (c) => envChunks.push(c));
        const envDone = new Promise((resolve, reject) => {
            envPass.on('end', resolve);
            envPass.on('error', reject);
        });
        envelope.append(ciphertext, {name: RESULT_DATA});
        envelope.append(wrapped, {name: RESULT_KEY});
        await envelope.finalize();
        await envDone;

        const stamp = Date.now().toString(16);
        const envelopePath = path.join(os.tmpdir(), `adaptfully-test-env-${stamp}.zip`);
        const outPath = path.join(os.tmpdir(), `adaptfully-test-out-${stamp}.zip`);
        const extractDir = path.join(os.tmpdir(), `adaptfully-test-x-${stamp}`);

        try {
            fs.writeFileSync(envelopePath, Buffer.concat(envChunks));
            assert.equal(await zipHasEntries(envelopePath, [RESULT_DATA, RESULT_KEY]), true);

            const kind = await decryptResultEnvelopeToFile(
                envelopePath,
                client.privateKey,
                outPath,
            );

            assert.equal(kind, 'envelope');
            assert.equal(fileLooksLikeZip(outPath), true);
            await extractZipFile(outPath, extractDir);
            assert.equal(
                fs.readFileSync(path.join(extractDir, 'payload.txt'), 'utf8'),
                'hello-from-disk',
            );
        } finally {
            fs.rmSync(envelopePath, {force: true});
            fs.rmSync(outPath, {force: true});
            fs.rmSync(extractDir, {recursive: true, force: true});
        }
    });

    it('decryptResultEnvelopeToFile passthrough copies plain zips without re-extract', async () => {
        const archiver = (await import('archiver')).default;
        const {PassThrough} = await import('node:stream');
        const archive = archiver('zip', {zlib: {level: 0}});
        const pass = new PassThrough();
        const chunks = [];

        archive.pipe(pass);
        pass.on('data', (c) => chunks.push(c));
        const done = new Promise((resolve, reject) => {
            pass.on('end', resolve);
            pass.on('error', reject);
        });
        archive.append('plain', {name: 'a.txt'});
        await archive.finalize();
        await done;

        const stamp = Date.now().toString(16);
        const inPath = path.join(os.tmpdir(), `adaptfully-test-plain-${stamp}.zip`);
        const outPath = path.join(os.tmpdir(), `adaptfully-test-copy-${stamp}.zip`);
        const client = generateResultKeyPair();

        try {
            fs.writeFileSync(inPath, Buffer.concat(chunks));
            const kind = await decryptResultEnvelopeToFile(inPath, client.privateKey, outPath);

            assert.equal(kind, 'passthrough');
            assert.deepEqual(fs.readFileSync(outPath), fs.readFileSync(inPath));
        } finally {
            fs.rmSync(inPath, {force: true});
            fs.rmSync(outPath, {force: true});
        }
    });
});
