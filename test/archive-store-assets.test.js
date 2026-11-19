import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import yauzl from 'yauzl';
import {
    createDeployArchive,
    createReleaseArchive,
    createSourceArchive,
    deploymentsNeedStoreAssets,
    isListingDeployerType,
} from '../lib/node/archive.js';

/**
 * @param {string} zipPath
 * @returns {Promise<string[]>}
 */
function listZipEntries (zipPath) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, {lazyEntries: true, autoClose: true}, (openErr, zipfile) => {
            if (openErr) {
                reject(openErr);

                return;
            }

            const names = [];

            zipfile.on('error', reject);
            zipfile.on('end', () => resolve(names));
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                names.push(String(entry.fileName || '').replace(/\\/g, '/'));
                zipfile.readEntry();
            });
        });
    });
}

/**
 * @param {import('archiver').Archiver} archive
 * @param {string} outPath
 */
async function writeArchive (archive, outPath) {
    await pipeline(archive, fs.createWriteStream(outPath));
}

describe('archive store-assets packing', () => {
    /** @type {string} */
    let root;
    /** @type {string} */
    let prevCwd;
    /** @type {string} */
    let deployFolder;
    /** @type {string} */
    let listingDir;
    /** @type {string} */
    let binaryDir;
    /** @type {string} */
    let artifactDir;

    before(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptfully-archive-sa-'));
        prevCwd = process.cwd();
        process.chdir(root);

        deployFolder = path.join(root, 'deploy');
        fs.mkdirSync(deployFolder, {recursive: true});
        fs.writeFileSync(path.join(deployFolder, 'index.html'), '<html></html>');

        const meta = path.join(root, 'assets', 'meta');
        const store = path.join(meta, 'store-assets', 'ios');

        fs.mkdirSync(store, {recursive: true});
        fs.writeFileSync(path.join(store, 'big.bin'), Buffer.alloc(1024, 9));
        fs.writeFileSync(path.join(meta, 'notes.txt'), 'keep-me');

        listingDir = path.join(meta, 'deployments', 'ios-listing');
        binaryDir = path.join(meta, 'deployments', 'ios');
        fs.mkdirSync(listingDir, {recursive: true});
        fs.mkdirSync(binaryDir, {recursive: true});
        fs.writeFileSync(
            path.join(listingDir, 'manifest.json'),
            JSON.stringify({type: 'apple-listing', credentialsFrom: 'ios'}, null, 2),
        );
        fs.writeFileSync(
            path.join(binaryDir, 'manifest.json'),
            JSON.stringify({type: 'apple'}, null, 2),
        );
        fs.writeFileSync(path.join(binaryDir, 'apple.json'), '{"ok":true}');

        artifactDir = path.join(root, 'artifacts');
        fs.mkdirSync(artifactDir, {recursive: true});
        fs.writeFileSync(path.join(artifactDir, 'app.ipa'), 'ipa');
    });

    after(() => {
        process.chdir(prevCwd);
        fs.rmSync(root, {recursive: true, force: true});
    });

    it('detects listing deployer types', () => {
        assert.equal(isListingDeployerType('apple-listing'), true);
        assert.equal(isListingDeployerType('google-listing'), true);
        assert.equal(isListingDeployerType('apple'), false);
        assert.equal(deploymentsNeedStoreAssets([listingDir]), true);
        assert.equal(deploymentsNeedStoreAssets([binaryDir]), false);
    });

    it('omits store-assets from source archives by default', async () => {
        const zipPath = path.join(root, 'source.zip');

        await writeArchive(
            createSourceArchive(deployFolder, '{"name":"t"}', {
                deploymentDirs: [binaryDir],
                log: () => {},
            }),
            zipPath,
        );

        const names = await listZipEntries(zipPath);

        assert.ok(names.includes('deploy/index.html'));
        assert.ok(names.includes('meta/notes.txt'));
        assert.ok(names.some((n) => n.startsWith('meta/deployments/ios/')));
        assert.ok(!names.some((n) => n.startsWith('meta/store-assets/')));
    });

    it('omits store-assets from release archives unless opted in', async () => {
        const zipPath = path.join(root, 'release.zip');

        await writeArchive(
            createReleaseArchive(deployFolder, '{"name":"t"}', [binaryDir], {
                log: () => {},
            }),
            zipPath,
        );

        const names = await listZipEntries(zipPath);

        assert.ok(!names.some((n) => n.startsWith('meta/store-assets/')));
    });

    it('includes store-assets for listing deploy archives when opted in', async () => {
        const zipPath = path.join(root, 'listing-deploy.zip');

        await writeArchive(
            createDeployArchive(artifactDir, listingDir, '{"name":"t"}', {
                deploymentDirs: [binaryDir],
                includeArtifact: false,
                includeStoreAssets: true,
                log: () => {},
            }),
            zipPath,
        );

        const names = await listZipEntries(zipPath);

        assert.ok(names.some((n) => n.startsWith('meta/store-assets/')));
        assert.ok(names.some((n) => n.startsWith('meta/deployments/ios-listing/')));
        assert.ok(!names.includes('app.ipa'));
    });

    it('omits store-assets from binary deploy archives by default', async () => {
        const zipPath = path.join(root, 'binary-deploy.zip');

        await writeArchive(
            createDeployArchive(artifactDir, binaryDir, '{"name":"t"}', {
                includeStoreAssets: false,
                log: () => {},
            }),
            zipPath,
        );

        const names = await listZipEntries(zipPath);

        assert.ok(names.includes('app.ipa'));
        assert.ok(names.some((n) => n.startsWith('meta/deployments/ios/')));
        assert.ok(!names.some((n) => n.startsWith('meta/store-assets/')));
    });
});
