import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} src
 * @param {string} dest
 */
export function copyRecursiveSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyRecursiveSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function listHtmlFilesRecursive(dir) {
    /** @type {string[]} */
    const files = [];

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listHtmlFilesRecursive(fullPath));
        } else if (entry.name.endsWith('.html')) {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * @param {string} dir
 */
export function emptyDirSync(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}
