import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import unzipper from 'unzip-stream';
import {createDeployArchive, createReleaseArchive, createSourceArchive} from './archive.js';
import {clearStaleBuildExtract} from './artifacts.js';
import {listHtmlFilesRecursive} from './fs-utils.js';
import {printBuildReport} from './report.js';
import {
    createEnvelopeFromInnerZip,
    decryptResultEnvelope,
    generateResultKeyPair,
    resolveEncryptPublicKey,
} from './choreCrypto.js';

const POLL_MS = 5000;

/**
 * @param {string} gameId
 * @param {string} platformKey
 */
export function buildInfoParam (gameId, platformKey) {
    return platformKey && platformKey !== gameId ? `${gameId}_${platformKey}` : gameId;
}

/**
 * Build wrapfully.json routing config appended to the Yap zip.
 */
export function buildWrapfullyJobConfig (stage, family, gameId, platformKey, deploymentKey) {
    /** @type {Record<string, string>} */
    const job = {
        stage,
        route: family,
        platformKey,
        gameId,
    };

    if (stage === 'deploy') {
        if (!deploymentKey) {
            throw new Error('deploy stage requires deploymentKey');
        }
        job.deploymentKey = deploymentKey;
    }

    return job;
}

async function streamToBuffer (stream) {
    const chunks = [];

    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
}

async function sleep (ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit zip to Showfully Yap, poll until complete, return result zip Buffer.
 */
export async function submitWrapfullyChore ({
    server,
    accessToken,
    zipBuffer,
    log = console.log,
}) {
    const base = server.replace(/\/?$/, '/');
    const submitUrl = `${base}yap/wrapfully`;
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/zip',
    };

    log(`adaptfully: POST ${submitUrl}`);

    let submitJson;

    try {
        const {data} = await axios.post(submitUrl, zipBuffer, {
            maxRedirects: 0,
            headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
        });

        submitJson = data;
    } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ECONNREFUSED') {
            throw new Error(`Cannot connect to Showfully server "${server}"`);
        }
        throw err;
    }

    if (submitJson?.errors?.length) {
        throw new Error(submitJson.errors[0]);
    }
    if (!submitJson?.choreId) {
        throw new Error('Showfully did not return a choreId');
    }

    const {choreId} = submitJson;

    log(`adaptfully: chore ${choreId} submitted; waiting…`);

    let lastStatus = '';

    for (;;) {
        const statusUrl = `${base}yap/wrapfully/${encodeURIComponent(choreId)}/status`;
        const {data: status} = await axios.get(statusUrl, {
            headers: {Authorization: `Bearer ${accessToken}`},
            validateStatus: () => true,
        });

        if (status?.state === 'complete') {
            break;
        }
        if (status?.state === 'error' || status?.errors?.length) {
            throw new Error(status.errors?.[0] || `Chore ${choreId} failed`);
        }

        const message = String(status?.status || status?.state || 'waiting');

        if (message !== lastStatus) {
            log(`adaptfully: ${message}…`);
            lastStatus = message;
        }
        await sleep(POLL_MS);
    }

    log(`adaptfully: downloading chore ${choreId}`);
    const downloadUrl = `${base}yap/wrapfully/${encodeURIComponent(choreId)}`;
    const {data, headers: resHeaders} = await axios.get(downloadUrl, {
        headers: {Authorization: `Bearer ${accessToken}`},
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        validateStatus: () => true,
    });

    const ctype = resHeaders['content-type'] || '';

    if (ctype.includes('application/json')) {
        const json = JSON.parse(Buffer.from(data).toString('utf8'));

        throw new Error(json.errors?.[0] || 'Chore download returned JSON');
    }

    return Buffer.from(data);
}

/**
 * @param {string} gameId
 * @param {string} contents
 * @param {string} server
 * @param {'build' | 'deploy' | 'release'} stage
 * @param {string} family
 * @param {string} deployFolder
 * @param {{ name: string, version: string, config?: object }} pkg
 * @param {'extract' | string} mode
 * @param {{
 *   log?: (message: string) => void,
 *   publishDir?: string,
 *   deploymentDirs?: string[],
 *   platformKey?: string,
 *   deploymentKey?: string,
 *   artifactPath?: string,
 *   accessToken?: string,
 *   encrypt?: boolean,
 *   encryptPublicKey?: string,
 *   wrapfullyConfig?: object,
 * }} [options]
 */
export async function send (
    gameId,
    contents,
    server,
    stage,
    family,
    deployFolder,
    pkg,
    mode = 'extract',
    options = {},
) {
    const log = options.log ?? console.log;
    const platformKey = options.platformKey ?? family;
    const outputRoot = pkg.config?.outputFolder || 'output';
    const accessToken = options.accessToken;

    if (!accessToken) {
        throw new Error('accessToken (Showfully PAT) is required for Yap wrapfully chores');
    }

    if (mode === 'extract') {
        clearStaleBuildExtract(outputRoot);
    }

    let archiveStream;

    if (stage === 'deploy') {
        if (!options.artifactPath) {
            throw new Error('deploy stage requires options.artifactPath to the prior build artifact directory');
        }
        if (!options.deploymentKey) {
            throw new Error('deploy stage requires options.deploymentKey');
        }
        archiveStream = createDeployArchive(options.artifactPath, options.publishDir, contents, {log});
    } else if (stage === 'release') {
        archiveStream = createReleaseArchive(deployFolder, contents, options.deploymentDirs ?? [], {log});
    } else {
        archiveStream = createSourceArchive(deployFolder, contents, {
            log,
            publishDir: options.publishDir,
            deploymentDirs: options.deploymentDirs,
        });
    }

    if (stage !== 'deploy') {
        const htmlFiles = listHtmlFilesRecursive(deployFolder);

        log(`adaptfully: sending ${htmlFiles.length} HTML file(s) from ${path.resolve(deployFolder)}`);
    }

    // Append wrapfully.json routing into the archive by rebuilding into a buffer.
    const job = buildWrapfullyJobConfig(stage, family, gameId, platformKey, options.deploymentKey);
    const innerChunks = [];

    // Re-pack: read archiveStream into zip, add wrapfully.json
    // Archiver streams aren't easily mutable — collect then use yazl-free approach:
    // pipe archive to buffer, unzip to tmp, add file, rezip is heavy.
    // Simpler: createSourceArchive already finalized as stream — append via second archiver
    // that copies entries is complex. Instead append wrapfully.json by concatenating
    // a sidecar zip is wrong. Best: write wrapfully.json into deploy folder meta before
    // archive... but that mutates disk.
    //
    // Practical approach matching Dutifully: build archive, buffer it, then use a new
    // archiver that includes the buffer as... no that's nested.
    //
    // Use jszip-like: buffer the created archive by consuming stream, then use
    // adm-zip equivalent — we have unzipper. Extract to tmp, write wrapfully.json, rezip.

    const tmpRoot = path.join(outputRoot, `.adaptfully-yap-${Date.now().toString(16)}`);

    fs.mkdirSync(tmpRoot, {recursive: true});
    try {
        await pipeline(archiveStream, unzipper.Extract({path: tmpRoot, concurrency: 1}));
        fs.writeFileSync(path.join(tmpRoot, 'wrapfully.json'), JSON.stringify(job, null, 2));

        const {default: archiver} = await import('archiver');
        const {PassThrough} = await import('node:stream');
        const archive = archiver('zip', {zlib: {level: 0}});
        const pass = new PassThrough();

        archive.pipe(pass);
        pass.on('data', (c) => innerChunks.push(c));

        const done = new Promise((resolve, reject) => {
            pass.on('end', resolve);
            pass.on('error', reject);
            archive.on('error', reject);
        });

        archive.directory(tmpRoot, false);
        await archive.finalize();
        await done;
    } finally {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    }

    let uploadBuffer = Buffer.concat(innerChunks);
    let resultPriv = null;

    if (options.encrypt) {
        const {pem, kid} = resolveEncryptPublicKey(
            options.wrapfullyConfig || {},
            options.encryptPublicKey,
        );
        const resultKeyPair = generateResultKeyPair();
        const envelope = await createEnvelopeFromInnerZip(uploadBuffer, {
            publicKeyPem: pem,
            kid,
            resultKeyPair,
        });

        uploadBuffer = envelope.zip;
        resultPriv = envelope.resultPriv;
        log(`adaptfully: encrypting chore with kid "${kid}"`);
    }

    let resultBuffer = await submitWrapfullyChore({
        server,
        accessToken,
        zipBuffer: uploadBuffer,
        log,
    });

    if (resultPriv) {
        try {
            resultBuffer = await decryptResultEnvelope(resultBuffer, resultPriv);
        } catch (err) {
            throw new Error(`Failed to decrypt Wrapfully result envelope: ${err.message || err}`);
        }
    }

    if (!Buffer.isBuffer(resultBuffer) || resultBuffer.length < 4
        || resultBuffer[0] !== 0x50 || resultBuffer[1] !== 0x4b) {
        throw new Error('Chore download is not a valid zip (truncated or corrupt response)');
    }

    const destination = mode === 'extract'
        ? unzipper.Extract({path: `${outputRoot}/`, concurrency: 1})
        : fs.createWriteStream(`${outputRoot}/${pkg.name}-${pkg.version}-${stage}-${family}.zip`);

    try {
        await pipeline(Readable.from(resultBuffer), destination);
    } catch (err) {
        throw new Error(
            `Failed to unpack chore result (${resultBuffer.length} bytes): ${err.message || err}`
        );
    }

    if (mode === 'extract') {
        printBuildReport(`${stage}-${family}`, pkg);
    }
}
