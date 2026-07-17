import { CapacitorPackager } from './capacitor.js';
import { CordovaPackager } from './cordova.js';
import { ElectronPackager } from './electron.js';
import { Packager, VALID_PACKAGERS } from './base.js';
import { WebPackager } from './web.js';

export { CapacitorPackager, resolvePlatformSocialLogin } from './capacitor.js';
export { CordovaPackager } from './cordova.js';
export {
    ElectronPackager,
    buildElectronMain,
    buildElectronPreload,
    resolvePlatformSteamId,
} from './electron.js';
export { Packager, VALID_PACKAGERS } from './base.js';
export { WebPackager } from './web.js';

/** @typedef {import('./base.js').PackagerName} PackagerName */

/** @type {Record<PackagerName, typeof Packager>} */
const PACKAGER_REGISTRY = {
    web: WebPackager,
    electron: ElectronPackager,
    cordova: CordovaPackager,
    capacitor: CapacitorPackager,
};

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string>, steamId?: number | string }> } }} pkg
 * @param {{ log?: (message: string) => void, platforms?: string[] }} [options]
 * @returns {Packager}
 */
export function createPackagerForPlatform(platformKey, pkg, options = {}) {
    const packagerId = Packager.resolvePlatformPackager(platformKey, pkg);

    if (!VALID_PACKAGERS.includes(packagerId)) {
        throw new Error(
            `Invalid packager "${packagerId}" for platform "${platformKey}". `
            + `Expected one of: ${VALID_PACKAGERS.join(', ')}`,
        );
    }

    const PackagerClass = PACKAGER_REGISTRY[packagerId];
    return new PackagerClass(pkg, {
        ...options,
        platformKey,
    });
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string }> } }} pkg
 * @returns {PackagerName}
 */
export function resolvePlatformPackager(platformKey, pkg) {
    return Packager.resolvePlatformPackager(platformKey, pkg);
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string>, steamId?: number | string }> } }} pkg
 */
export function validatePlatformPackager(platformKey, pkg) {
    createPackagerForPlatform(platformKey, pkg).validate();
}

/**
 * @param {Record<string, string>} registrations
 */
export function usesSteamAuth(registrations) {
    return Object.values(registrations).includes('steam-auth');
}

/**
 * @param {Record<string, string>} registrations
 */
export function usesSocialAuth(registrations) {
    return Object.values(registrations).includes('social-auth');
}

/**
 * @param {string} dest
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string>, steamId?: number | string }> } }} pkg
 * @param {{ log?: (message: string) => void, platforms?: string[] }} [options]
 */
export function applyPackagerTemplates(dest, platformKey, pkg, options = {}) {
    createPackagerForPlatform(platformKey, pkg, options).applyTemplates(dest);
}

/**
 * @param {string} dest
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string }> } }} pkg
 * @param {string[]} htmlPaths
 * @param {{ log?: (message: string) => void, platforms?: string[] }} [options]
 */
export function applyPackagerHtmlExtras(dest, platformKey, pkg, htmlPaths, options = {}) {
    createPackagerForPlatform(platformKey, pkg, options).applyHtmlExtras(dest, htmlPaths);
}

/**
 * @param {PackagerName} packager
 * @param {string} platformKey
 */
export function needsGameConfig(packager, platformKey) {
    const instance = new PACKAGER_REGISTRY[packager]({}, { platformKey });
    return instance.needsGameConfig();
}

/**
 * @param {PackagerName} packager
 * @param {string} platformKey
 */
export function buildPackagerHtmlInjection(packager, platformKey) {
    const instance = new PACKAGER_REGISTRY[packager]({}, { platformKey });
    return instance.buildHtmlInjection();
}
