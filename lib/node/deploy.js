import axios from 'axios';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzip-stream';
import { createArchive } from './archive.js';
import { loadProjectConfig, resolveServerUrl } from './config.js';
import { printBuildReport } from './report.js';

/**
 * @param {string} gameId
 * @param {string} contents
 * @param {string} server
 * @param {string} builder
 * @param {string} deployFolder
 * @param {{ name: string, version: string }} pkg
 * @param {'extract' | string} mode
 */
export async function send(gameId, contents, server, builder, deployFolder, pkg, mode = 'extract') {
    const destination = mode === 'extract'
        ? unzipper.Extract({ path: './output/', concurrency: 1 })
        : fs.createWriteStream(`./output/${pkg.name}-${pkg.version}-${builder}.zip`);

    const archiveStream = createArchive(deployFolder, contents);
    const { data } = await axios.post(`${server}${builder}/${gameId}`, archiveStream, {
        maxRedirects: 0,
        responseType: 'stream',
    });

    archiveStream.on('close', () => {
        console.log('completed send');
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

/**
 * @param {string[]} [argv=process.argv]
 */
export async function deployFromCli(argv = process.argv) {
    const builder = argv[2] ?? 'all';
    const cliServer = argv[3];
    const mode = argv[4] ?? 'extract';

    const { pkg, wrapfullyConfig } = await loadProjectConfig();
    const server = resolveServerUrl(wrapfullyConfig, cliServer);
    const deployFolder = pkg.config?.deployFolder || 'deploy';

    await send(
        `${pkg.name}-${pkg.version}`,
        JSON.stringify(pkg),
        server,
        builder,
        deployFolder,
        pkg,
        mode,
    );
}
