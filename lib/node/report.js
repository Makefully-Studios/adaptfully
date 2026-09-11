import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} builder
 * @param {{ name: string, version: string }} pkg
 * @param {{ extractRoot?: string }} [options]
 */
export function printBuildReport(builder, pkg, options = {}) {
    const extractRoot = path.resolve(options.extractRoot || './output');
    const statusPath = path.join(extractRoot, 'wrapfully-status.json');
    const legacyPath = path.join(extractRoot, `${pkg.name}-${pkg.version}-${builder}.txt`);

    let status = null;
    if (fs.existsSync(statusPath)) {
        try {
            status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        } catch {
            console.warn('Unable to read wrapfully-status.json');
        }
    }

    if (status) {
        for (const event of status.events) {
            const line = `[${event.step}] ${event.message}`;
            if (event.level === 'error') {
                console.error(line);
            } else if (event.level === 'warn') {
                console.warn(line);
            } else {
                console.log(line);
            }
        }

        if (!status.ok) {
            throw new Error('Wrapfully build finished with errors.');
        }
        return;
    }

    if (fs.existsSync(legacyPath)) {
        console.log(fs.readFileSync(legacyPath, 'utf8'));
    }
}
