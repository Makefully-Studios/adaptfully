import archiver from 'archiver';
import fs from 'node:fs';

/**
 * @param {string} deployFolder
 * @param {string} contents - serialized package.json for the zip
 */
export function createArchive(deployFolder, contents) {
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

    zip.directory(`${deployFolder}/`, 'deploy');
    zip.file(`${deployFolder}/index.html`, { name: 'deploy/index.html' });
    if (fs.existsSync('assets/meta/')) {
        zip.directory('assets/meta/', 'meta');
    }
    zip.append(contents, { name: 'package.json' });
    zip.finalize();

    return zip;
}
