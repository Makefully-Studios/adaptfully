import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.join(PACKAGE_ROOT, 'lib', 'runtime');

/** @typedef {'web' | 'steam' | 'android' | 'ios'} BuildChannel */

export const VALID_CHANNELS = new Set(['web', 'steam', 'android', 'ios']);

/** @type {Record<BuildChannel, string[]>} */
const CHANNEL_EXCLUDED_AUTH = {
    steam: ['auth/google-auth.js'],
    web: ['auth/steam-auth.js'],
    android: ['auth/steam-auth.js'],
    ios: ['auth/steam-auth.js'],
};

/** @type {Record<BuildChannel, string>} */
const CHANNEL_EXT_SCRIPTS = {
    web: '<script src="https://accounts.google.com/gsi/client" async defer></script>\n',
    android: '<script src="https://accounts.google.com/gsi/client" async defer></script>\n',
    ios: '<script src="https://accounts.google.com/gsi/client" async defer></script>\n',
};

/** @type {Record<BuildChannel, string>} */
const CHANNEL_AUTH_REGISTRATION = {
    web: "adaptfully.register('auth', adaptfully.auth.Google);",
    android: "adaptfully.register('auth', adaptfully.auth.Google);",
    ios: "adaptfully.register('auth', adaptfully.auth.Google);",
    steam: "adaptfully.register('auth', adaptfully.auth.Steam);",
};

const DEV_AUTH_REGISTRATION = "adaptfully.register('auth', adaptfully.auth.Dev);";

const RUNTIME_BASE_SCRIPTS = [
    'core.js',
    'platform.js',
];

export function getPackageRoot() {
    return PACKAGE_ROOT;
}

export function getRuntimeDir() {
    return RUNTIME_DIR;
}

export function resolveRuntimeScript(relativePath) {
    return path.join(RUNTIME_DIR, relativePath);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {BuildChannel}
 */
export function getBuildChannel(env = process.env) {
    const channel = env.ENTANGLEMENT_CHANNEL
        || env.VITE_ENTANGLEMENT_CHANNEL
        || env.ADAPTFULLY_CHANNEL
        || 'web';

    if (!VALID_CHANNELS.has(channel)) {
        throw new Error(
            `Invalid distribution channel "${channel}". Expected one of: ${[...VALID_CHANNELS].join(', ')}`,
        );
    }

    return /** @type {BuildChannel} */ (channel);
}

/** @param {BuildChannel} [channel] */
export function authRegistrationForChannel(channel = getBuildChannel()) {
    const registration = CHANNEL_AUTH_REGISTRATION[channel];
    if (!registration) {
        throw new Error(`No auth registration for channel: ${channel}`);
    }
    return registration;
}

export function devAuthRegistration() {
    return DEV_AUTH_REGISTRATION;
}

/** @param {BuildChannel} [channel] */
export function getAuthScriptsForChannel(channel = getBuildChannel()) {
    const excluded = new Set(CHANNEL_EXCLUDED_AUTH[channel] ?? []);
    const scripts = RUNTIME_BASE_SCRIPTS.map((rel) => resolveRuntimeScript(rel));

    const authDir = path.join(RUNTIME_DIR, 'auth');
    for (const file of fs.readdirSync(authDir).sort()) {
        const rel = path.join('auth', file).replace(/\\/g, '/');
        if (!excluded.has(rel)) {
            scripts.push(path.join(authDir, file));
        }
    }

    return scripts;
}

/** @param {BuildChannel} [channel] */
export function authRegistrationScript(channel = getBuildChannel()) {
    return authRegistrationForChannel(channel);
}

/** @param {BuildChannel} [channel] */
export function extScriptsForBuildChannel(channel = getBuildChannel()) {
    return CHANNEL_EXT_SCRIPTS[channel] ?? '';
}

/**
 * @param {Array<string | { src: string }>} includes
 * @param {BuildChannel} [channel]
 */
export function filterIncludesForBuildChannel(includes, channel = getBuildChannel()) {
    if (channel !== 'steam') {
        return includes;
    }

    return includes.filter((include) => {
        const rel = typeof include === 'string' ? include : include.src;
        return rel !== 'script/banner-ads.js';
    });
}

/**
 * @param {BuildChannel} channel
 * @param {{ profiles: object, allExpansionsBitmask?: number }} distributionConfig
 */
export function distributionSettingsForBuild(channel, distributionConfig) {
    return {
        channel,
        profiles: distributionConfig.profiles,
        allExpansionsBitmask: distributionConfig.allExpansionsBitmask ?? 15,
    };
}
