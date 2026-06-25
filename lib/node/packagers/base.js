import fs from 'node:fs';
import path from 'node:path';
import { STANDARD_PLUGINS } from '../registrations.js';

/** @typedef {import('../registrations.js').RegistrationMap} RegistrationMap */
/** @typedef {'web' | 'electron' | 'cordova' | 'capacitor'} PackagerName */

/** @type {PackagerName[]} */
export const VALID_PACKAGERS = ['web', 'electron', 'cordova', 'capacitor'];

const PACKAGER_MARKER = '<!-- adaptfully-packager -->';
const PACKAGER_END_MARKER = '<!-- /adaptfully-packager -->';

/**
 * @typedef {Object} PackagerOptions
 * @property {string[]} [platforms] Platform keys this packager targets (e.g. ios + android for Cordova)
 * @property {string} [platformKey] Active platform for a single prebuild run
 * @property {(message: string) => void} [log]
 */

/**
 * @param {string} value
 */
function isDeployPath(value) {
    return value.startsWith('/') || value.startsWith('./') || value.includes('/');
}

/**
 * @param {string} platformKey
 */
function gameConfigPlatform(platformKey) {
    if (platformKey === 'uwp') {
        return 'ms';
    }
    return platformKey;
}

/**
 * @param {string} dest
 * @param {string} platformKey
 * @param {{ name: string, version: string, config?: { title?: string } }} pkg
 * @param {(message: string) => void} log
 */
function writeGameConfig(dest, platformKey, pkg, log) {
    const content = `window.gameConfig = ${JSON.stringify({
        title: pkg.config?.title,
        version: pkg.version,
        id: pkg.name,
        platform: gameConfigPlatform(platformKey),
    }, null, 4)};`;

    fs.writeFileSync(path.join(dest, 'game-config.js'), content);
    log('adaptfully: write game-config.js');
}

/**
 * @param {string} html
 * @param {string} injection
 */
function injectPackagerExtras(html, injection) {
    if (!injection) {
        return html;
    }

    const markerPattern = new RegExp(
        `${escapeRegExp(PACKAGER_MARKER)}[\\s\\S]*?${escapeRegExp(PACKAGER_END_MARKER)}\\n?`,
    );

    if (markerPattern.test(html)) {
        return html.replace(markerPattern, injection);
    }

    if (html.includes(PACKAGER_MARKER)) {
        return html.replace(PACKAGER_MARKER, `${injection}${PACKAGER_MARKER}`);
    }

    if (html.includes('<!-- adaptfully -->')) {
        return html.replace('<!-- adaptfully -->', `${injection}<!-- adaptfully -->`);
    }

    if (html.includes('<!-- scripts -->')) {
        return html.replace('<!-- scripts -->', `${injection}<!-- scripts -->`);
    }

    if (html.includes('</head>')) {
        return html.replace('</head>', `${injection}</head>`);
    }

    throw new Error(
        'Cannot inject packager extras: HTML needs '
        + '<!-- adaptfully-packager -->…<!-- /adaptfully-packager -->, '
        + '<!-- adaptfully -->, <!-- scripts -->, or </head>',
    );
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class Packager {
    /** @type {PackagerName} */
    static id = 'web';

    /** @type {string[]} */
    static defaultPlatforms = [];

    /**
     * @param {object} pkg
     * @param {PackagerOptions} [options]
     */
    constructor(pkg, options = {}) {
        this.pkg = pkg;
        this.log = options.log ?? (() => {});
        this.platformKey = options.platformKey ?? null;

        const configured = Packager.resolveConfiguredPlatforms(this.constructor.id, pkg);
        if (options.platforms?.length) {
            this.platforms = [...options.platforms];
        } else if (configured.length) {
            this.platforms = configured;
        } else {
            this.platforms = [...this.constructor.defaultPlatforms];
        }

        if (this.platformKey && !this.platforms.includes(this.platformKey)) {
            this.platforms.push(this.platformKey);
        }
    }

    /** @returns {PackagerName} */
    get name() {
        return /** @type {PackagerName} */ (this.constructor.id);
    }

    /**
     * @param {PackagerName} packagerId
     * @param {{ config?: { platforms?: Record<string, { packager?: string }> } }} pkg
     * @returns {string[]}
     */
    static resolveConfiguredPlatforms(packagerId, pkg) {
        const platforms = pkg.config?.platforms ?? {};
        return Object.entries(platforms)
            .filter(([, config]) => (config?.packager ?? 'web') === packagerId)
            .map(([key]) => key);
    }

    /**
     * @param {string} platformKey
     * @param {{ config?: { platforms?: Record<string, { packager?: string }> } }} pkg
     * @returns {PackagerName}
     */
    static resolvePlatformPackager(platformKey, pkg) {
        const platform = pkg.config?.platforms?.[platformKey];
        const packager = platform?.packager ?? 'web';
        return /** @type {PackagerName} */ (packager);
    }

    /**
     * Merged registrations from every platform in {@link this.platforms}.
     * @returns {RegistrationMap}
     */
    collectRegistrations() {
        /** @type {RegistrationMap} */
        const merged = {};
        for (const key of this.platforms) {
            const registrations = this.pkg.config?.platforms?.[key]?.registrations ?? {};
            Object.assign(merged, registrations);
        }
        return merged;
    }

    /**
     * Registrations for the active prebuild platform, or merged when none is set.
     * @returns {RegistrationMap}
     */
    getActiveRegistrations() {
        if (this.platformKey) {
            return this.pkg.config?.platforms?.[this.platformKey]?.registrations ?? {};
        }
        return this.collectRegistrations();
    }

    /**
     * Standard Adaptfully plugin ids (auth, storage, etc.) used across targeted platforms.
     * Custom deploy paths are excluded.
     * @returns {Set<string>}
     */
    collectUsedPlugins() {
        const plugins = new Set();
        for (const key of this.platforms) {
            const registrations = this.pkg.config?.platforms?.[key]?.registrations ?? {};
            for (const value of Object.values(registrations)) {
                if (typeof value === 'string' && !isDeployPath(value) && STANDARD_PLUGINS[value]) {
                    plugins.add(value);
                }
            }
        }
        return plugins;
    }

    /**
     * @param {string} pluginId Standard plugin id (e.g. steam-auth, dev-auth, localStorage)
     * @param {{ scope?: 'active' | 'all' }} [options]
     */
    usesPlugin(pluginId, options = {}) {
        const registrations = options.scope === 'all'
            ? this.collectRegistrations()
            : this.getActiveRegistrations();
        return Object.values(registrations).includes(pluginId);
    }

    validate() {
        if (!VALID_PACKAGERS.includes(this.name)) {
            throw new Error(
                `Invalid packager "${this.name}". Expected one of: ${VALID_PACKAGERS.join(', ')}`,
            );
        }

        if (this.usesPlugin('steam-auth', { scope: 'all' }) && this.name !== 'electron') {
            const platformLabel = this.platformKey ?? this.platforms[0] ?? 'unknown';
            throw new Error(
                `Platform "${platformLabel}" uses steam-auth but packager is "${this.name}". `
                + `Set config.platforms.${platformLabel}.packager to "electron".`,
            );
        }
    }

    needsGameConfig() {
        return false;
    }

    /**
     * @param {string[]} headExtras
     * @param {string[]} bodyScripts
     * @returns {string}
     */
    formatHtmlInjection(headExtras, bodyScripts) {
        if (headExtras.length === 0 && bodyScripts.length === 0) {
            return '';
        }

        let block = `${PACKAGER_MARKER}\n`;
        for (const extra of headExtras) {
            block += `${extra}\n`;
        }
        for (const script of bodyScripts) {
            block += `${script}\n`;
        }
        block += `${PACKAGER_END_MARKER}\n`;
        return block;
    }

    /** @param {string} dest */
    applyTemplates(dest) {
        if (this.needsGameConfig() && this.platformKey) {
            writeGameConfig(dest, this.platformKey, this.pkg, this.log);
        }
    }

    /** @returns {string} */
    buildHtmlInjection() {
        const bodyScripts = [];
        if (this.needsGameConfig()) {
            bodyScripts.push('<script src="game-config.js"></script>');
        }
        return this.formatHtmlInjection([], bodyScripts);
    }

    /**
     * @param {string} dest
     * @param {string[]} htmlPaths
     */
    applyHtmlExtras(dest, htmlPaths) {
        const injection = this.buildHtmlInjection();
        if (!injection) {
            return;
        }

        for (const relativePath of htmlPaths) {
            const htmlPath = path.join(dest, relativePath);
            if (!fs.existsSync(htmlPath)) {
                throw new Error(`htmlInjections file not found in deploy output: ${relativePath}`);
            }

            const html = fs.readFileSync(htmlPath, 'utf8');
            const updated = injectPackagerExtras(html, injection);
            if (updated !== html) {
                this.log(`adaptfully: inject packager extras into ${relativePath}`);
                fs.writeFileSync(htmlPath, updated);
            }
        }
    }

    /**
     * @param {string} dest
     * @param {string[]} htmlPaths
     */
    prebuild(dest, htmlPaths) {
        this.validate();
        this.applyTemplates(dest);
        this.applyHtmlExtras(dest, htmlPaths);
    }
}
