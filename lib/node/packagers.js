import fs from 'node:fs';
import path from 'node:path';
import { getTemplatesDir } from './paths.js';

/** @typedef {'web' | 'electron' | 'cordova' | 'capacitor'} PackagerName */

/** @type {PackagerName[]} */
export const VALID_PACKAGERS = ['web', 'electron', 'cordova', 'capacitor'];

const STEAM_INIT = `const path = require('path');

try {
    require('steamworks.js').electronEnableSteamOverlay();
} catch (err) {
    console.error('Steam overlay unavailable:', err);
}
`;

const STEAM_PRELOAD = `,
                preload: path.join(__dirname, 'preload.js')`;

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string> }>, steamId?: number } }} pkg
 * @returns {PackagerName}
 */
export function resolvePlatformPackager(platformKey, pkg) {
    const platform = pkg.config?.platforms?.[platformKey];
    const packager = platform?.packager ?? 'web';
    return /** @type {PackagerName} */ (packager);
}

/**
 * @param {Record<string, string>} registrations
 */
export function usesSteamAuth(registrations) {
    return Object.values(registrations).includes('steam-auth');
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string> }>, steamId?: number } }} pkg
 */
export function validatePlatformPackager(platformKey, pkg) {
    const platform = pkg.config?.platforms?.[platformKey];
    const packager = resolvePlatformPackager(platformKey, pkg);

    if (!VALID_PACKAGERS.includes(packager)) {
        throw new Error(
            `Invalid packager "${packager}" for platform "${platformKey}". `
            + `Expected one of: ${VALID_PACKAGERS.join(', ')}`,
        );
    }

    const registrations = platform?.registrations ?? {};
    if (usesSteamAuth(registrations) && packager !== 'electron') {
        throw new Error(
            `Platform "${platformKey}" uses steam-auth but packager is "${packager}". `
            + 'Set config.platforms.' + platformKey + '.packager to "electron".',
        );
    }

    if (usesSteamAuth(registrations) && !pkg.config?.steamId) {
        throw new Error(
            `Platform "${platformKey}" uses steam-auth but config.steamId is not set.`,
        );
    }
}

/**
 * @param {string} content
 * @param {string} markerName
 * @param {string} replacement
 */
export function applyTemplateMarker(content, markerName, replacement) {
    const pattern = new RegExp(
        `/\\* adaptfully-${markerName} \\*/[\\s\\S]*?/\\* /adaptfully-${markerName} \\*/`,
        'g',
    );
    return content.replace(pattern, replacement);
}

/**
 * @param {PackagerName} packager
 */
export function resolvePackagerTemplateDir(packager) {
    return path.join(getTemplatesDir(), packager);
}

/**
 * @param {string} dest Prebuild output directory
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { packager?: string, registrations?: Record<string, string> }>, steamId?: number } }} pkg
 * @param {{ log?: (message: string) => void }} [options]
 */
export function applyPackagerTemplates(dest, platformKey, pkg, options = {}) {
    const log = options.log ?? (() => {});
    const packager = resolvePlatformPackager(platformKey, pkg);

    validatePlatformPackager(platformKey, pkg);

    if (packager === 'web') {
        return;
    }

    const templateDir = resolvePackagerTemplateDir(packager);
    if (!fs.existsSync(templateDir)) {
        throw new Error(
            `Packager "${packager}" has no templates yet (missing ${templateDir}).`,
        );
    }

    if (packager === 'electron') {
        applyElectronTemplates(dest, platformKey, pkg, templateDir, log);
    }
}

/**
 * @param {string} dest
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { registrations?: Record<string, string> }>, steamId?: number } }} pkg
 * @param {string} templateDir
 * @param {(message: string) => void} log
 */
function applyElectronTemplates(dest, platformKey, pkg, templateDir, log) {
    const registrations = pkg.config?.platforms?.[platformKey]?.registrations ?? {};
    const withSteam = usesSteamAuth(registrations);
    const mainTemplatePath = path.join(templateDir, 'main.js');

    if (!fs.existsSync(mainTemplatePath)) {
        throw new Error(`Electron packager template missing: ${mainTemplatePath}`);
    }

    let mainContent = fs.readFileSync(mainTemplatePath, 'utf8');

    if (withSteam) {
        mainContent = applyTemplateMarker(mainContent, 'steam-init', STEAM_INIT);
        mainContent = applyTemplateMarker(mainContent, 'steam-preload', STEAM_PRELOAD);

        const preloadTemplatePath = path.join(templateDir, 'preload.js');
        if (!fs.existsSync(preloadTemplatePath)) {
            throw new Error(`Electron steam-auth template missing: ${preloadTemplatePath}`);
        }

        const preloadContent = fs.readFileSync(preloadTemplatePath, 'utf8')
            .replace(/\{\{STEAM_APP_ID\}\}/g, String(pkg.config.steamId));

        fs.writeFileSync(path.join(dest, 'preload.js'), preloadContent);
        log('adaptfully: write preload.js (steam-auth)');
    } else {
        mainContent = applyTemplateMarker(mainContent, 'steam-init', '');
        mainContent = applyTemplateMarker(mainContent, 'steam-preload', '');
    }

    fs.writeFileSync(path.join(dest, 'main.js'), mainContent);
    log('adaptfully: write main.js (electron)');
}
