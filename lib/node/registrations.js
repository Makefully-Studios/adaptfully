import fs from 'node:fs';
import { resolveRuntimeScript } from './paths.js';

/** @typedef {Record<string, string>} RegistrationMap */

/**
 * @typedef {Object} StandardPlugin
 * @property {string[]} scripts Runtime script paths relative to lib/runtime
 * @property {(registerKey: string) => string} registration
 * @property {string} [extScript] Optional HTML snippet injected before adaptfully scripts
 */

/** @type {Record<string, StandardPlugin>} */
export const STANDARD_PLUGINS = {
    'google-auth': {
        scripts: ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/google-auth.js'],
        registration: (key) => `adaptfully.register('${key}', adaptfully.auth.Google);`,
        extScript: '<script src="https://accounts.google.com/gsi/client" async defer></script>',
    },
    'steam-auth': {
        scripts: ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/steam-auth.js'],
        registration: (key) => `adaptfully.register('${key}', adaptfully.auth.Steam);`,
    },
    'dev-auth': {
        scripts: ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/dev-auth.js'],
        registration: (key) => `adaptfully.register('${key}', adaptfully.auth.Dev);`,
    },
    localStorage: {
        scripts: ['core.js', 'storage/_helpers.js', 'storage/local-storage.js'],
        registration: (key) => `adaptfully.register('${key}', adaptfully.storage.LocalStorage());`,
    },
    indexedDB: {
        scripts: ['core.js', 'storage/_helpers.js', 'storage/indexed-db.js'],
        registration: (key) => `adaptfully.register('${key}', adaptfully.storage.IndexedDB());`,
    },
};

/** Default Wrapfully builder → config.platforms key */
export const DEFAULT_BUILDER_PLATFORMS = {
    steam: 'steam',
    'steam-dev': 'steam',
    win: 'steam',
    'win-dev': 'steam',
    mac: 'steam',
    'mac-dev': 'steam',
    linux: 'steam',
    'linux-dev': 'steam',
    android: 'android',
    'android-dev': 'android',
    ios: 'ios',
    'ios-dev': 'ios',
    'ios-sim': 'ios',
    webapp: 'web',
    cordova: 'cordova',
    'cordova-dev': 'cordova',
    apple: 'apple',
    'apple-dev': 'apple',
    uwp: 'uwp',
};

const ADAPTFULLY_MARKER = '<!-- adaptfully -->';
const ADAPTFULLY_END_MARKER = '<!-- /adaptfully -->';

function readRuntimeScript(relativePath) {
    return fs.readFileSync(resolveRuntimeScript(relativePath), 'utf8');
}

/**
 * @param {RegistrationMap} registrations
 * @returns {{
 *   runtimeScripts: string[],
 *   extScripts: string[],
 *   deployScripts: string[],
 *   inlineRegistrations: string[],
 * }}
 */
export function collectRegistrationParts(registrations) {
    if (!registrations || typeof registrations !== 'object') {
        throw new Error('registrations must be an object');
    }

    const entries = Object.entries(registrations);
    const runtimeScripts = [];
    const extScripts = [];
    const deployScripts = [];
    const inlineRegistrations = [];

    for (const [registerKey, value] of entries) {
        if (!value || typeof value !== 'string') {
            throw new Error(`Invalid registration for "${registerKey}": expected a string`);
        }

        if (isDeployPath(value)) {
            const src = normalizeDeployScriptSrc(value);
            deployScripts.push({ key: registerKey, src });
            continue;
        }

        const plugin = STANDARD_PLUGINS[value];
        if (!plugin) {
            throw new Error(
                `Unknown Adaptfully plugin "${value}" for "${registerKey}". `
                + `Known plugins: ${Object.keys(STANDARD_PLUGINS).join(', ')}`,
            );
        }

        for (const script of plugin.scripts) {
            if (!runtimeScripts.includes(script)) {
                runtimeScripts.push(script);
            }
        }

        if (plugin.extScript && !extScripts.includes(plugin.extScript)) {
            extScripts.push(plugin.extScript);
        }

        inlineRegistrations.push(plugin.registration(registerKey));
    }

    return { runtimeScripts, extScripts, deployScripts, inlineRegistrations };
}

/**
 * @param {RegistrationMap} registrations
 */
export function resolveRegistrationAssets(registrations) {
    const { runtimeScripts, extScripts, deployScripts, inlineRegistrations } = collectRegistrationParts(registrations);

    return {
        runtimeScriptPaths: runtimeScripts.map((rel) => resolveRuntimeScript(rel)),
        inlineScript: inlineRegistrations.join('\n'),
        extScripts,
        deployScriptSrcs: deployScripts.map(({ src }) => src),
    };
}

function isDeployPath(value) {
    return value.startsWith('/') || value.startsWith('./') || value.includes('/');
}

/**
 * @param {string} value Deploy-relative script path from config
 * @returns {string} Value for HTML script src (leading `/` = site root; otherwise page-relative)
 */
function normalizeDeployScriptSrc(value) {
    if (value.startsWith('/')) {
        return value;
    }
    return value.replace(/^\.\//, '');
}

/**
 * @param {string} builder
 * @param {Record<string, { builders?: string[], registrations?: RegistrationMap }>} [platforms]
 * @returns {string | null}
 */
export function resolvePlatformKey(builder, platforms = {}) {
    if (!platforms || Object.keys(platforms).length === 0) {
        return null;
    }

    for (const [platformKey, platformConfig] of Object.entries(platforms)) {
        if (platformConfig?.builders?.includes(builder)) {
            return platformKey;
        }
    }

    if (platforms[builder]?.registrations) {
        return builder;
    }

    const mapped = DEFAULT_BUILDER_PLATFORMS[builder];
    if (mapped && platforms[mapped]) {
        return mapped;
    }

    if (platforms[builder]) {
        return builder;
    }

    return mapped ?? null;
}

/**
 * @param {RegistrationMap} registrations
 * @param {{ log?: (message: string) => void }} [options]
 */
export function buildAdaptfullyInjection(registrations, options = {}) {
    const log = options.log ?? (() => {});
    const parts = collectRegistrationParts(registrations);
    if (parts.runtimeScripts.length === 0
        && parts.extScripts.length === 0
        && parts.deployScripts.length === 0
        && parts.inlineRegistrations.length === 0) {
        return '';
    }

    for (const [registerKey, value] of Object.entries(registrations)) {
        if (isDeployPath(value)) {
            log(`adaptfully: registering ${registerKey} ← ${normalizeDeployScriptSrc(value)}`);
        } else {
            log(`adaptfully: registering ${registerKey} ← ${value}`);
        }
    }

    let block = `${ADAPTFULLY_MARKER}\n`;

    for (const extScript of parts.extScripts) {
        block += `${extScript}\n`;
    }

    const coreScript = 'core.js';
    const bootstrapScripts = parts.runtimeScripts.filter((script) => script === coreScript);
    const pluginScripts = parts.runtimeScripts.filter((script) => script !== coreScript);

    for (const script of bootstrapScripts) {
        block += `<script>\n${readRuntimeScript(script)}\n</script>\n`;
    }

    for (const { src } of parts.deployScripts) {
        block += `<script src="${src}"></script>\n`;
    }

    for (const script of pluginScripts) {
        block += `<script>\n${readRuntimeScript(script)}\n</script>\n`;
    }

    if (parts.inlineRegistrations.length > 0) {
        block += `<script>\n${parts.inlineRegistrations.join('\n')}\n</script>\n`;
    }

    block += `${ADAPTFULLY_END_MARKER}\n`;
    return block;
}

/**
 * @param {string} html
 * @param {string} injection
 */
export function injectAdaptfullyRegistrations(html, injection) {
    if (!injection) {
        return html;
    }

    const markerPattern = new RegExp(
        `${escapeRegExp(ADAPTFULLY_MARKER)}[\\s\\S]*?${escapeRegExp(ADAPTFULLY_END_MARKER)}\\n?`,
    );

    if (markerPattern.test(html)) {
        return html.replace(markerPattern, injection);
    }

    if (html.includes('<!-- scripts -->')) {
        return html.replace('<!-- scripts -->', `${injection}<!-- scripts -->`);
    }

    if (html.includes('</head>')) {
        return html.replace('</head>', `${injection}</head>`);
    }

    throw new Error(
        'Cannot inject Adaptfully registrations: HTML needs '
        + '<!-- adaptfully -->…<!-- /adaptfully -->, <!-- scripts -->, or </head>',
    );
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { registrations?: RegistrationMap, builder?: string }> } }} pkg
 * @returns {{ platformKey: string, registrations: RegistrationMap | null }}
 */
export function resolvePlatformRegistrationsByKey(platformKey, pkg) {
    const platforms = pkg.config?.platforms ?? {};
    const registrations = platforms[platformKey]?.registrations ?? null;

    if (!registrations || Object.keys(registrations).length === 0) {
        return { platformKey, registrations: null };
    }

    return { platformKey, registrations };
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { registrations?: RegistrationMap, builder?: string }> } }} pkg
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {string}
 */
export function adaptfullyInjectionForPlatform(platformKey, pkg, options = {}) {
    const log = options.log ?? (() => {});
    const { registrations } = resolvePlatformRegistrationsByKey(platformKey, pkg);

    if (!registrations) {
        log(`adaptfully: no registrations configured for platform "${platformKey}"; skipping injection`);
        return '';
    }

    return buildAdaptfullyInjection(registrations, { log });
}

/**
 * @param {string} platformKey
 * @param {{ config?: { platforms?: Record<string, { builder?: string }> } }} pkg
 */
export function resolveBuilderForPlatform(platformKey, pkg) {
    const platform = pkg.config?.platforms?.[platformKey];
    if (platform?.builder) {
        return platform.builder;
    }

    if (platformKey === 'web') {
        return 'webapp';
    }

    return platformKey;
}

/**
 * @param {string} arg CLI platform or Wrapfully builder name
 * @param {{ config?: { platforms?: Record<string, { builder?: string }> } }} pkg
 */
export function resolveCliPlatformAndBuilder(arg, pkg) {
    const platforms = pkg.config?.platforms ?? {};

    if (platforms[arg]) {
        return {
            platformKey: arg,
            builder: resolveBuilderForPlatform(arg, pkg),
        };
    }

    return {
        platformKey: resolvePlatformKey(arg, platforms) ?? arg,
        builder: arg,
    };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
