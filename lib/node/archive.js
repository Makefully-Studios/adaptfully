import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { appendMetaIcons, isMetaIconFilename, META_DIR } from './icons.js';

const
    DEPLOYMENTS_DIRNAME = 'deployments',
    PUBLISH_DIRNAME = 'publish',
    STORE_ASSETS_DIRNAME = 'store-assets';

/**
 * Listing sync deployers need meta/store-assets; binary builds do not.
 * @param {string | null | undefined} type
 * @returns {boolean}
 */
export function isListingDeployerType (type) {
    return type === 'google-listing' || type === 'apple-listing';
}

/**
 * @param {string} deploymentDir
 * @returns {object | null}
 */
function readDeploymentManifest (deploymentDir) {
    try {
        const raw = fs.readFileSync(path.join(deploymentDir, 'manifest.json'), 'utf8');

        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * True when any packaged deployment folder is a listing deployer.
 * @param {string[]} [deploymentDirs]
 * @returns {boolean}
 */
export function deploymentsNeedStoreAssets (deploymentDirs = []) {
    for (const dir of deploymentDirs) {
        if (!dir) {
            continue;
        }

        const manifest = readDeploymentManifest(path.resolve(dir));

        if (isListingDeployerType(manifest?.type)) {
            return true;
        }
    }

    return false;
}

/**
 * @param {string} dirPath
 * @returns {string}
 */
function toPosixDir (dirPath) {
    return `${path.resolve(dirPath).replace(/\\/g, '/').replace(/\/?$/, '')}/`;
}

/**
 * @param {import('archiver').Archiver} zip
 * @param {string} sourceDir Absolute or relative directory to pack
 * @param {string} zipPrefix Zip entry prefix without trailing slash
 */
function appendDirectory (zip, sourceDir, zipPrefix) {
    const
        source = toPosixDir(sourceDir),
        prefix = `${zipPrefix.replace(/\\/g, '/').replace(/\/?$/, '')}/`;

    zip.directory(source, prefix);
}

/**
 * @param {string} name
 * @param {{ includeStoreAssets?: boolean }} options
 * @returns {boolean}
 */
function shouldSkipMetaEntry (name, options) {
    if (isMetaIconFilename(name)) {
        return true;
    }

    if (name === STORE_ASSETS_DIRNAME && !options.includeStoreAssets) {
        return true;
    }

    return false;
}

/**
 * @param {import('archiver').Archiver} zip
 * @param {string} [publishDir] Single deployment folder
 * @param {string[]} [deploymentDirs] Multiple deployment folders for release
 * @param {{ log?: (message: string) => void, includeStoreAssets?: boolean }} [options]
 */
function appendMeta (zip, publishDir, deploymentDirs = [], options = {}) {
    const
        log = options.log ?? (() => {}),
        includeStoreAssets = options.includeStoreAssets === true,
        metaDir = path.resolve(META_DIR);

    // Always ship layered icons (project files or Adaptfully placeholders).
    appendMetaIcons(zip, {metaDir, log});

    if (!fs.existsSync(metaDir)) {
        log(`adaptfully: meta dir missing at ${metaDir}; skipping credentials`);

        return;
    }

    const
        deploymentsRoot = path.join(metaDir, DEPLOYMENTS_DIRNAME),
        storeAssetsPath = path.join(metaDir, STORE_ASSETS_DIRNAME);

    if (!includeStoreAssets && fs.existsSync(storeAssetsPath)) {
        log('adaptfully: omitting meta/store-assets (not needed for this chore)');
    }

    if (!fs.existsSync(deploymentsRoot)) {
        for (const entry of fs.readdirSync(metaDir, {withFileTypes: true})) {
            if (shouldSkipMetaEntry(entry.name, {includeStoreAssets})) {
                continue;
            }

            const fullPath = path.join(metaDir, entry.name);

            if (entry.isDirectory()) {
                appendDirectory(zip, fullPath, `meta/${entry.name}`);
            } else {
                zip.file(fullPath, {name: `meta/${entry.name}`});
            }
        }

        return;
    }

    for (const entry of fs.readdirSync(metaDir, {withFileTypes: true})) {
        if (entry.name === DEPLOYMENTS_DIRNAME || entry.name === PUBLISH_DIRNAME) {
            continue;
        }

        if (shouldSkipMetaEntry(entry.name, {includeStoreAssets})) {
            continue;
        }

        const fullPath = path.join(metaDir, entry.name);

        if (entry.isDirectory()) {
            appendDirectory(zip, fullPath, `meta/${entry.name}`);
        } else {
            zip.file(fullPath, {name: `meta/${entry.name}`});
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

function createZipStream (deployFolder, contents, options = {}) {
    const
        zip = archiver('zip', {zlib: {level: 0}}),
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
        }, {prefix: 'deploy'});
        zip.append(options.indexHtml, {name: 'deploy/index.html'});
    } else {
        appendDirectory(zip, deployFolder, 'deploy');
        zip.file(path.resolve(deployFolder, 'index.html'), {name: 'deploy/index.html'});
    }

    appendMeta(zip, options.publishDir, options.deploymentDirs, {
        log,
        includeStoreAssets: options.includeStoreAssets === true,
    });
    zip.append(contents, {name: 'package.json'});
    zip.finalize();

    return zip;
}

/**
 * Game source zip for /build (and legacy callers). Include `deploymentDirs` when
 * the builder needs signing credentials (e.g. Capacitor ios-dev).
 *
 * @param {string} deployFolder
 * @param {string} contents
 * @param {{ indexHtml?: string, publishDir?: string, deploymentDirs?: string[], log?: (message: string) => void, includeStoreAssets?: boolean }} [options]
 */
export function createSourceArchive (deployFolder, contents, options = {}) {
    return createZipStream(deployFolder, contents, options);
}

/**
 * @deprecated Use createSourceArchive, createDeployArchive, or createReleaseArchive.
 */
export function createArchive (deployFolder, contents, options = {}) {
    return createSourceArchive(deployFolder, contents, options);
}

/**
 * Prior artifact zip plus deployment folder(s) for /deploy.
 * Packages non-deployment meta from META_DIR; `meta/store-assets` only when
 * `includeStoreAssets` is true (listing deployers).
 *
 * @param {string} artifactPath
 * @param {string} publishDir Primary deployment folder (…/meta/deployments/<key>)
 * @param {string} [contents]
 * @param {{ log?: (message: string) => void, deploymentDirs?: string[], includeArtifact?: boolean, includeStoreAssets?: boolean }} [options]
 */
export function createDeployArchive (artifactPath, publishDir, contents, options = {}) {
    const
        zip = archiver('zip', {zlib: {level: 0}}),
        log = options.log ?? console.log,
        includeArtifact = options.includeArtifact !== false,
        extraDirs = Array.isArray(options.deploymentDirs) ? options.deploymentDirs : [];

    if (includeArtifact && artifactPath && fs.existsSync(artifactPath)) {
        zip.directory(toPosixDir(artifactPath), false);
    }

    // Prefer meta/deployments/<key> packaging (not legacy meta/publish) so
    // credentialsFrom sibling keys resolve under the same layout Wrapfully reads.
    const dirs = [];

    if (publishDir) {
        dirs.push(publishDir);
    }

    for (const dir of extraDirs) {
        if (dir && !dirs.includes(dir)) {
            dirs.push(dir);
        }
    }

    appendMeta(zip, null, dirs, {
        log,
        includeStoreAssets: options.includeStoreAssets === true,
    });

    if (contents) {
        zip.append(contents, {name: 'package.json'});
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
 * @param {{ indexHtml?: string, log?: (message: string) => void, includeStoreAssets?: boolean }} [options]
 */
export function createReleaseArchive (deployFolder, contents, deploymentDirs, options = {}) {
    return createZipStream(deployFolder, contents, {
        ...options,
        deploymentDirs,
    });
}
