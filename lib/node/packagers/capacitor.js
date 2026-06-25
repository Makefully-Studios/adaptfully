import { Packager } from './base.js';

export class CapacitorPackager extends Packager {
    /** @type {'capacitor'} */
    static id = 'capacitor';

    /** @type {string[]} */
    static defaultPlatforms = ['ios', 'android'];

    needsGameConfig() {
        return true;
    }
}
