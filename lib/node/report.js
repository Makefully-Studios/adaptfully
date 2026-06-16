import fs from 'node:fs';

/**
 * @param {string} builder
 * @param {{ name: string, version: string }} pkg
 */
export function printBuildReport(builder, pkg) {
    const statusPath = './output/wrapfully-status.json';
    const legacyPath = `./output/${pkg.name}-${pkg.version}-${builder}.txt`;

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
            console.error('Wrapfully build finished with errors.');
            process.exit(1);
        }
        return;
    }

    if (fs.existsSync(legacyPath)) {
        console.log(fs.readFileSync(legacyPath, 'utf8'));
    }
}
