import fs from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import yauzl from 'yauzl';

/**
 * Resolve entry path under destDir; reject zip-slip escapes.
 * @param {string} destDir
 * @param {string} fileName
 */
function safeEntryPath (destDir, fileName) {
    const root = path.resolve(destDir);
    const target = path.resolve(root, fileName);

    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`Refusing zip entry outside extract root: ${fileName}`);
    }

    return target;
}

/**
 * Whether a zip on disk contains every listed entry name (forward-slash paths).
 * @param {string} zipPath
 * @param {string[]} entryNames
 * @returns {Promise<boolean>}
 */
export function zipHasEntries (zipPath, entryNames) {
    const needed = new Set(entryNames.map((n) => String(n).replace(/\\/g, '/')));

    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, {lazyEntries: true, autoClose: true}, (openErr, zipfile) => {
            if (openErr) {
                reject(openErr);

                return;
            }

            let settled = false;
            const found = new Set();
            const fail = (err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            };
            const finish = (value) => {
                if (!settled) {
                    settled = true;
                    resolve(value);
                }
            };

            zipfile.on('error', fail);
            zipfile.on('end', () => {
                finish([...needed].every((n) => found.has(n)));
            });
            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                const name = String(entry.fileName || '').replace(/\\/g, '/');

                if (needed.has(name)) {
                    found.add(name);
                    if (found.size === needed.size) {
                        // Close early once all required members are present.
                        try {
                            zipfile.close();
                        } catch {
                            // ignore
                        }
                        finish(true);

                        return;
                    }
                }
                zipfile.readEntry();
            });
        });
    });
}

/**
 * Extract a zip on disk into destDir without holding the archive in RAM.
 * Uses yauzl lazy entries + per-file streams.
 * @param {string} zipPath
 * @param {string} destDir
 * @returns {Promise<void>}
 */
export function extractZipFile (zipPath, destDir) {
    fs.mkdirSync(destDir, {recursive: true});

    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, {lazyEntries: true, autoClose: true}, (openErr, zipfile) => {
            if (openErr) {
                reject(openErr);

                return;
            }

            let settled = false;
            const fail = (err) => {
                if (!settled) {
                    settled = true;
                    reject(err);
                }
            };
            const done = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };

            zipfile.on('error', fail);
            zipfile.on('end', done);
            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                const name = String(entry.fileName || '').replace(/\\/g, '/');

                if (!name || name.includes('\0')) {
                    fail(new Error(`Invalid zip entry name: ${entry.fileName}`));

                    return;
                }

                let destPath;

                try {
                    destPath = safeEntryPath(destDir, name);
                } catch (err) {
                    fail(err);

                    return;
                }

                if (/\/$/u.test(name)) {
                    try {
                        fs.mkdirSync(destPath, {recursive: true});
                    } catch (err) {
                        fail(err);

                        return;
                    }
                    zipfile.readEntry();

                    return;
                }

                try {
                    fs.mkdirSync(path.dirname(destPath), {recursive: true});
                } catch (err) {
                    fail(err);

                    return;
                }

                zipfile.openReadStream(entry, (streamErr, readStream) => {
                    if (streamErr) {
                        fail(streamErr);

                        return;
                    }
                    const writeStream = fs.createWriteStream(destPath);

                    pipeline(readStream, writeStream)
                        .then(() => {
                            zipfile.readEntry();
                        })
                        .catch(fail);
                });
            });
        });
    });
}

/**
 * Peek whether a file starts with the ZIP local-file magic (`PK`).
 * @param {string} filePath
 * @returns {boolean}
 */
export function fileLooksLikeZip (filePath) {
    const fd = fs.openSync(filePath, 'r');

    try {
        const buf = Buffer.alloc(4);
        const n = fs.readSync(fd, buf, 0, 4, 0);

        return n >= 2 && buf[0] === 0x50 && buf[1] === 0x4b;
    } finally {
        fs.closeSync(fd);
    }
}
