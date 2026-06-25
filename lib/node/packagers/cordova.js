import fs from 'node:fs';
import path from 'node:path';
import { Packager } from './base.js';

const CORDOVA_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src * \'self\' data: gap: \'unsafe-inline\' \'unsafe-eval\'; style-src * \'self\' \'unsafe-inline\' \'unsafe-eval\' gap:; script-src * \'self\' \'unsafe-inline\' \'unsafe-eval\' gap:; frame-src *;" />';

const CORDOVA_VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />';

const CORDOVA_STUB = `/**
 * Stub for non-Cordova environments. Cordova replaces this at runtime on device builds.
 */
window.cordova = null;
`;

export class CordovaPackager extends Packager {
    /** @type {'cordova'} */
    static id = 'cordova';

    /** @type {string[]} */
    static defaultPlatforms = ['ios', 'android'];

    needsGameConfig() {
        return true;
    }

    /** @param {string} dest */
    applyTemplates(dest) {
        fs.writeFileSync(path.join(dest, 'cordova.js'), CORDOVA_STUB);
        this.log('adaptfully: write cordova.js');

        super.applyTemplates(dest);
    }

    buildHtmlInjection() {
        const headExtras = [CORDOVA_CSP, CORDOVA_VIEWPORT];
        const bodyScripts = ['<script src="cordova.js"></script>'];

        if (this.needsGameConfig()) {
            bodyScripts.push('<script src="game-config.js"></script>');
        }

        return this.formatHtmlInjection(headExtras, bodyScripts);
    }
}
