import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

const META_DIR = 'assets/meta';
const DEPLOYMENTS_DIRNAME = 'deployments';
const PUBLISH_DIRNAME = 'publish';

/**
 * @param {import('archiver').Archiver} zip
 * @param {string} [publishDir] Single deployment folder
 * @param {string[]} [deploymentDirs] Multiple deployment folders for release
 */
function appendMeta(zip, publishDir, deploymentDirs = []) {
    if (!fs.existsSync(META_DIR)) {
        return;
    }

    const deploymentsRoot = path.join(META_DIR, DEPLOYMENTS_DIRNAME);

    if (!fs.existsSync(deploymentsRoot)) {
        zip.directory(`${META_DIR}/`, 'meta');
        return;
    }

    for (const entry of fs.readdirSync(META_DIR, { withFileTypes: true })) {
        if (entry.name === DEPLOYMENTS_DIRNAME || entry.name === PUBLISH_DIRNAME) {
            continue;
        }

        const fullPath = path.join(META_DIR, entry.name);
        if (entry.isDirectory()) {
            zip.directory(`${fullPath}/`, `meta/${entry.name}`);
        } else {
            zip.file(fullPath, { name: `meta/${entry.name}` });
        }
    }

    if (publishDir && fs.existsSync(publishDir)) {
        zip.directory(`${publishDir}/`, `meta/${PUBLISH_DIRNAME}`);
        return;
    }

    for (const deploymentDir of deploymentDirs) {
        if (!fs.existsSync(deploymentDir)) {
            continue;
        }

        const deploymentKey = path.basename(deploymentDir);
        zip.directory(`${deploymentDir}/`, `meta/${DEPLOYMENTS_DIRNAME}/${deploymentKey}`);
    }
}

function createZipStream(deployFolder, contents, options = {}) {
    const zip = archiver('zip', { zlib: { level: 0 } });

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
        zip.directory(`${deployFolder}/`, 'deploy');
        zip.file(`${deployFolder}/index.html`, { name: 'deploy/index.html' });
    }

    appendMeta(zip, options.publishDir, options.deploymentDirs);
    zip.append(contents, { name: 'package.json' });
    zip.finalize();

    return zip;
}

/**
 * Game source zip for /build and /release (no credentials unless release).
 *
 * @param {string} deployFolder
 * @param {string} contents
 * @param {{ indexHtml?: string, publishDir?: string, deploymentDirs?: string[] }} [options]
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
 */
export function createDeployArchive(artifactPath, publishDir, contents) {
    const zip = archiver('zip', { zlib: { level: 0 } });

    zip.directory(`${artifactPath}/`, false);
    appendMeta(zip, publishDir);

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
 * @param {{ indexHtml?: string }} [options]
 */
export function createReleaseArchive(deployFolder, contents, deploymentDirs, options = {}) {
    return createZipStream(deployFolder, contents, {
        ...options,
        deploymentDirs,
    });
}
