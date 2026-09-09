import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveAccessToken,
    resolveEncryptFlag,
    resolveServerUrl,
} from '../lib/node/config.js';
import {buildWrapfullyJobConfig} from '../lib/node/deploy.js';
import {
    createEnvelopeFromInnerZip,
    generateResultKeyPair,
} from '../lib/node/choreCrypto.js';

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
});
