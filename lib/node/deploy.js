import axios from 'axios';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {createDeployArchive, createReleaseArchive, createSourceArchive} from './archive.js';
import {clearStaleBuildExtract} from './artifacts.js';
import {listHtmlFilesRecursive} from './fs-utils.js';
import {printBuildReport} from './report.js';
import {
    createEnvelopeFromInnerZip,
    decryptResultEnvelopeToFile,
    generateResultKeyPair,
    resolveEncryptPublicKey,
} from './choreCrypto.js';
import {extractZipFile, fileLooksLikeZip} from './unzip-file.js';

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

async function sleep (ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stream an axios response body to a file (does not buffer the whole body in RAM).
 * @param {import('axios').AxiosResponse} response
 * @param {string} outPath
 */
async function streamAxiosResponseToFile (response, outPath) {
    const body = response.data;

    if (!body || typeof body.pipe !== 'function') {
        throw new Error('Expected a streaming HTTP response body');
    }

    await pipeline(body, fs.createWriteStream(outPath));
}

/**
 * Submit zip to Showfully Yap, poll until complete, stream result zip to disk.
 * @returns {Promise<string>} absolute path to the downloaded zip (caller deletes)
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
    let logAfter = 0;

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

        if (status?.state === 'pending') {
            try {
                const logsUrl = `${base}yap/wrapfully/${encodeURIComponent(choreId)}/logs?after=${logAfter}`;
                const {data: logs} = await axios.get(logsUrl, {
                    headers: {Authorization: `Bearer ${accessToken}`},
                    validateStatus: () => true,
                });

                if (Array.isArray(logs?.lines) && logs.lines.length) {
                    for (const line of logs.lines) {
                        const text = line?.message || JSON.stringify(line);

                        log(`adaptfully: ${text}`);
                    }
                    logAfter = logs.after ?? logAfter;
                    lastStatus = '';
                }
            } catch (e) {
                // live logs are best-effort
            }
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
    const downloadPath = path.join(
        os.tmpdir(),
        `adaptfully-chore-${choreId}-${Date.now().toString(16)}.zip`,
    );

    try {
        const response = await axios.get(downloadUrl, {
            headers: {Authorization: `Bearer ${accessToken}`},
            responseType: 'stream',
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true,
        });
        const ctype = response.headers['content-type'] || '';

        if (response.status >= 400 || ctype.includes('application/json')) {
            const chunks = [];

            for await (const chunk of response.data) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const text = Buffer.concat(chunks).toString('utf8');
            let message = 'Chore download failed';

            try {
                const json = JSON.parse(text);

                message = json.errors?.[0] || message;
            } catch {
                if (text.trim()) {
                    message = text.slice(0, 500);
                }
            }
            throw new Error(message);
        }

        await streamAxiosResponseToFile(response, downloadPath);
    } catch (err) {
        fs.rmSync(downloadPath, {force: true});
        throw err;
    }

    return downloadPath;
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
 *   extractRoot?: string,
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
    const extractRoot = path.resolve(options.extractRoot || outputRoot);
    const accessToken = options.accessToken;

    if (!accessToken) {
        throw new Error('accessToken (Showfully PAT) is required for Yap wrapfully chores');
    }

    if (mode === 'extract') {
        fs.mkdirSync(extractRoot, { recursive: true });
        clearStaleBuildExtract(extractRoot);
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

    // Append wrapfully.json by extracting the upload archive to disk, then rezipping.
    const job = buildWrapfullyJobConfig(stage, family, gameId, platformKey, options.deploymentKey);
    const innerChunks = [];
    const stamp = Date.now().toString(16);
    const tmpRoot = path.join(outputRoot, `.adaptfully-yap-${stamp}`);
    const uploadZipPath = path.join(outputRoot, `.adaptfully-upload-${stamp}.zip`);

    fs.mkdirSync(tmpRoot, {recursive: true});
    try {
        await pipeline(archiveStream, fs.createWriteStream(uploadZipPath));
        await extractZipFile(uploadZipPath, tmpRoot);
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
        fs.rmSync(uploadZipPath, {force: true});
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

    const downloadPath = await submitWrapfullyChore({
        server,
        accessToken,
        zipBuffer: uploadBuffer,
        log,
    });
    const plainZipPath = path.join(
        os.tmpdir(),
        `adaptfully-plain-${path.basename(downloadPath)}`,
    );
    let resultZipPath = downloadPath;

    try {
        if (resultPriv) {
            try {
                await decryptResultEnvelopeToFile(downloadPath, resultPriv, plainZipPath);
                resultZipPath = plainZipPath;
            } catch (err) {
                throw new Error(
                    `Failed to decrypt Wrapfully result envelope: ${err.message || err}`
                );
            }
        }

        if (!fileLooksLikeZip(resultZipPath)) {
            throw new Error('Chore download is not a valid zip (truncated or corrupt response)');
        }

        if (mode === 'extract') {
            try {
                await extractZipFile(resultZipPath, extractRoot);
            } catch (err) {
                const size = fs.statSync(resultZipPath).size;

                throw new Error(
                    `Failed to unpack chore result (${size} bytes): ${err.message || err}`
                );
            }
            printBuildReport(`${stage}-${family}`, pkg, {extractRoot});
        } else {
            const destZip = path.join(
                extractRoot,
                `${pkg.name}-${pkg.version}-${stage}-${family}.zip`,
            );

            await pipeline(
                fs.createReadStream(resultZipPath),
                fs.createWriteStream(destZip),
            );
        }
    } finally {
        fs.rmSync(downloadPath, {force: true});
        fs.rmSync(plainZipPath, {force: true});
    }
}
