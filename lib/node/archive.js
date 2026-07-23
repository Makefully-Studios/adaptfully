import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { appendMetaIcons, isMetaIconFilename, META_DIR } from './icons.js';

const
    DEPLOYMENTS_DIRNAME = 'deployments',
    PUBLISH_DIRNAME = 'publish';

/**
 * @param {string} dirPath
 * @returns {string}
 */
function toPosixDir(dirPath) {
    return `${path.resolve(dirPath).replace(/\\/g, '/').replace(/\/?$/, '')}/`;
}

/**
 * @param {import('archiver').Archiver} zip
 * @param {string} sourceDir Absolute or relative directory to pack
 * @param {string} zipPrefix Zip entry prefix without trailing slash
 */
function appendDirectory(zip, sourceDir, zipPrefix) {
    const
        source = toPosixDir(sourceDir),
        prefix = `${zipPrefix.replace(/\\/g, '/').replace(/\/?$/, '')}/`;
    zip.directory(source, prefix);
}

/**
 * @param {import('archiver').Archiver} zip
 * @param {string} [publishDir] Single deployment folder
 * @param {string[]} [deploymentDirs] Multiple deployment folders for release
 * @param {{ log?: (message: string) => void }} [options]
 */
function appendMeta(zip, publishDir, deploymentDirs = [], options = {}) {
    const
        log = options.log ?? (() => {}),
        metaDir = path.resolve(META_DIR);

    // Always ship layered icons (project files or Adaptfully placeholders).
    appendMetaIcons(zip, { metaDir, log });

    if (!fs.existsSync(metaDir)) {
        log(`adaptfully: meta dir missing at ${metaDir}; skipping credentials`);
        return;
    }

    const deploymentsRoot = path.join(metaDir, DEPLOYMENTS_DIRNAME);

    if (!fs.existsSync(deploymentsRoot)) {
        for (const entry of fs.readdirSync(metaDir, { withFileTypes: true })) {
            if (isMetaIconFilename(entry.name)) {
                continue;
            }
            const fullPath = path.join(metaDir, entry.name);
            if (entry.isDirectory()) {
                appendDirectory(zip, fullPath, `meta/${entry.name}`);
            } else {
                zip.file(fullPath, { name: `meta/${entry.name}` });
            }
        }
        return;
    }

    for (const entry of fs.readdirSync(metaDir, { withFileTypes: true })) {
        if (entry.name === DEPLOYMENTS_DIRNAME || entry.name === PUBLISH_DIRNAME) {
            continue;
        }
        if (isMetaIconFilename(entry.name)) {
            continue;
        }

        const fullPath = path.join(metaDir, entry.name);
        if (entry.isDirectory()) {
            appendDirectory(zip, fullPath, `meta/${entry.name}`);
        } else {
            zip.file(fullPath, { name: `meta/${entry.name}` });
        }
    }

    if (publishDir && fs.existsSync(publishDir)) {
        appendDirectory(zip, publishDir, `meta/${PUBLISH_DIRNAME}`);
        log(`adaptfully: packaged meta/${PUBLISH_DIRNAME} from ${path.resolve(publishDir)}`);
        return;
    }

    const packaged = [];

    for (const deploymentDir of deploymentDirs) {
        const resolved = path.resolve(deploymentDir);
        if (!fs.existsSync(resolved)) {
            log(`adaptfully: skipping missing deployment dir ${resolved}`);
            continue;
        }

        const deploymentKey = path.basename(resolved);
        appendDirectory(zip, resolved, `meta/${DEPLOYMENTS_DIRNAME}/${deploymentKey}`);
        packaged.push(deploymentKey);
    }

    if (packaged.length) {
        log(`adaptfully: packaged deployments: ${packaged.join(', ')}`);
    } else if (deploymentDirs.length) {
        log('adaptfully: WARNING no deployment credential folders were packaged');
    }
}

function createZipStream(deployFolder, contents, options = {}) {
    const
        zip = archiver('zip', { zlib: { level: 0 } }),
        log = options.log ?? console.log;

    zip.on('warning', (err) => {
        if (err.code === 'ENOENT') {
            console.log(err);
            return;
        }
        throw err;
    });
    zip.on('error', (err) => {
        throw err;
    });
    zip.on('close', () => {
        console.log(`Zipped ${zip.pointer()} total bytes`);
    });

    if (options.indexHtml != null) {
        zip.glob('**/*', {
            cwd: deployFolder,
            ignore: ['index.html'],
        }, { prefix: 'deploy' });
        zip.append(options.indexHtml, { name: 'deploy/index.html' });
    } else {
        appendDirectory(zip, deployFolder, 'deploy');
        zip.file(path.resolve(deployFolder, 'index.html'), { name: 'deploy/index.html' });
    }

    appendMeta(zip, options.publishDir, options.deploymentDirs, { log });
    zip.append(contents, { name: 'package.json' });
    zip.finalize();

    return zip;
}

/**
 * Game source zip for /build and /release (no credentials unless release).
 *
 * @param {string} deployFolder
 * @param {string} contents
 * @param {{ indexHtml?: string, publishDir?: string, deploymentDirs?: string[], log?: (message: string) => void }} [options]
 */
export function createSourceArchive(deployFolder, contents, options = {}) {
    return createZipStream(deployFolder, contents, options);
}

/**
 * @deprecated Use createSourceArchive, createDeployArchive, or createReleaseArchive.
 */
export function createArchive(deployFolder, contents, options = {}) {
    return createSourceArchive(deployFolder, contents, options);
}

/**
 * Prior artifact zip plus one deployment folder for /deploy.
 *
 * @param {string} artifactPath
 * @param {string} publishDir
 * @param {string} [contents]
 * @param {{ log?: (message: string) => void }} [options]
 */
export function createDeployArchive(artifactPath, publishDir, contents, options = {}) {
    const
        zip = archiver('zip', { zlib: { level: 0 } }),
        log = options.log ?? console.log;

    zip.directory(toPosixDir(artifactPath), false);
    appendMeta(zip, publishDir, [], { log });

    if (contents) {
        zip.append(contents, { name: 'package.json' });
    }

    zip.finalize();
    return zip;
}

/**
 * Game source zip with all non-zip deployment credential folders for /release.
 *
 * @param {string} deployFolder
 * @param {string} contents
 * @param {string[]} deploymentDirs
 * @param {{ indexHtml?: string, log?: (message: string) => void }} [options]
 */
export function createReleaseArchive(deployFolder, contents, deploymentDirs, options = {}) {
    return createZipStream(deployFolder, contents, {
        ...options,
        deploymentDirs,
    });
}
