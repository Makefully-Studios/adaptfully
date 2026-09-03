import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzip-stream';
import { createDeployArchive, createReleaseArchive, createSourceArchive } from './archive.js';
import { clearStaleBuildExtract } from './artifacts.js';
import { listHtmlFilesRecursive } from './fs-utils.js';
import { printBuildReport } from './report.js';

/**
 * @param {string} gameId
 * @param {string} platformKey
 */
function buildInfoParam(gameId, platformKey) {
    return platformKey && platformKey !== gameId ? `${gameId}_${platformKey}` : gameId;
}

/**
 * @param {string} server
 * @param {'build' | 'deploy' | 'release'} stage
 * @param {string} family
 * @param {string} gameId
 * @param {string} platformKey
 * @param {string} [deploymentKey]
 */
function resolveWrapfullyUrl(server, stage, family, gameId, platformKey, deploymentKey) {
    const info = buildInfoParam(gameId, platformKey);

    if (stage === 'deploy') {
        return `${server}deploy/${deploymentKey}/${info}`;
    }

    return `${server}${family}/${stage}/${info}`;
}

/**
 * @param {string} gameId
 * @param {string} contents
 * @param {string} server
 * @param {'build' | 'deploy' | 'release'} stage
 * @param {string} family
 * @param {string} deployFolder
 * @param {{ name: string, version: string }} pkg
 * @param {'extract' | string} mode
 * @param {{ log?: (message: string) => void, publishDir?: string, deploymentDirs?: string[], platformKey?: string, deploymentKey?: string, artifactPath?: string }} [options]
 */
export async function send(gameId, contents, server, stage, family, deployFolder, pkg, mode = 'extract', options = {}) {
    const log = options.log ?? console.log;
    const platformKey = options.platformKey ?? family;
    const outputRoot = pkg.config?.outputFolder || 'output';

    if (mode === 'extract') {
        clearStaleBuildExtract(outputRoot);
    }

    const destination = mode === 'extract'
        ? unzipper.Extract({ path: `${outputRoot}/`, concurrency: 1 })
        : fs.createWriteStream(`${outputRoot}/${pkg.name}-${pkg.version}-${stage}-${family}.zip`);

    let archiveStream;

    if (stage === 'deploy') {
        if (!options.artifactPath) {
            throw new Error('deploy stage requires options.artifactPath to the prior build artifact directory');
        }
        if (!options.deploymentKey) {
            throw new Error('deploy stage requires options.deploymentKey');
        }
        archiveStream = createDeployArchive(options.artifactPath, options.publishDir, contents, { log });
    } else if (stage === 'release') {
        archiveStream = createReleaseArchive(deployFolder, contents, options.deploymentDirs ?? [], { log });
    } else {
        archiveStream = createSourceArchive(deployFolder, contents, {
            log,
            publishDir: options.publishDir,
            deploymentDirs: options.deploymentDirs,
        });
    }

    const url = resolveWrapfullyUrl(server, stage, family, gameId, platformKey, options.deploymentKey);
    log(`adaptfully: POST ${url}`);

    if (stage !== 'deploy') {
        const htmlFiles = listHtmlFilesRecursive(deployFolder);
        log(`adaptfully: sending ${htmlFiles.length} HTML file(s) from ${path.resolve(deployFolder)}`);
    }

    const { data } = await axios.post(url, archiveStream, {
        maxRedirects: 0,
        responseType: 'stream',
    });

    archiveStream.on('close', () => {
        log('adaptfully: upload complete');
    });

    try {
        await pipeline(data, destination);
    } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ECONNREFUSED') {
            console.error(`Cannot connect to Wrapfully server "${server}"`);
            process.exit(1);
        }
        throw err;
    }

    if (mode === 'extract') {
        printBuildReport(`${stage}-${family}`, pkg);
    }
}
