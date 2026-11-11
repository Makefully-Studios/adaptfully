import { Packager } from './base.js';

export class WebPackager extends Packager {
    /** @type {'web'} */
    static id = 'web';

    /** @type {string[]} */
    static defaultPlatforms = ['web', 'uwp', 'pwa', 'webos', 'lgtv'];

    needsGameConfig() {
        // Stamp version/platform for all web-family routes (web, uwp, pwa, webos)
        // so analytics resolveAppVersion() matches electron/capacitor builds.
        return true;
    }
}
