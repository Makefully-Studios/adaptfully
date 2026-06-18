import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzip-stream';
import { createArchive } from './archive.js';
import { listHtmlFilesRecursive } from './fs-utils.js';
import { printBuildReport } from './report.js';

/**
 * @param {string} gameId
 * @param {string} contents
 * @param {string} server
 * @param {string} builder
 * @param {string} deployFolder - prebuilt deploy directory
 * @param {{ name: string, version: string }} pkg
 * @param {'extract' | string} mode
 * @param {{ log?: (message: string) => void }} [options]
 */
export async function send(gameId, contents, server, builder, deployFolder, pkg, mode = 'extract', options = {}) {
    const log = options.log ?? console.log;
    const destination = mode === 'extract'
        ? unzipper.Extract({ path: './output/', concurrency: 1 })
        : fs.createWriteStream(`./output/${pkg.name}-${pkg.version}-${builder}.zip`);

    const htmlFiles = listHtmlFilesRecursive(deployFolder);
    log(`adaptfully: sending ${htmlFiles.length} HTML file(s) from ${path.resolve(deployFolder)}`);

    const archiveStream = createArchive(deployFolder, contents);
    const { data } = await axios.post(`${server}${builder}/${gameId}`, archiveStream, {
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
        printBuildReport(builder, pkg);
    }
}
