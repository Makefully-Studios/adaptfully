import { Packager } from './base.js';

export class WebPackager extends Packager {
    /** @type {'web'} */
    static id = 'web';

    /** @type {string[]} */
    static defaultPlatforms = ['web', 'uwp', 'pwa'];

    needsGameConfig() {
        return this.platformKey === 'uwp';
    }
}
