/**
 * Keys that configure platform behavior (not inherited identity/defaults).
 * These stay on `platforms.<key>` and are not treated as config.* overrides.
 */
export const PLATFORM_CONTROL_KEYS = new Set([
    'registrations',
    'builder',
    'builders',
    'packager',
    'deployments',
    'steamId',
    'socialLogin',
    'steamworks',
]);

/**
 * Resolve effective `config` for a platform: top-level `config.*` are defaults;
 * any non-control field on `config.platforms.<platformKey>` overrides them.
 *
 * @param {{ config?: Record<string, unknown> }} pkg
 * @param {string | null | undefined} platformKey
 * @returns {Record<string, unknown>}
 */
export function resolvePlatformConfig(pkg, platformKey) {
    const root = pkg?.config && typeof pkg.config === 'object' ? pkg.config : {};
    /** @type {Record<string, unknown>} */
    const resolved = { ...root };
    delete resolved.platforms;

    if (!platformKey || typeof platformKey !== 'string') {
        return resolved;
    }

    const platform = root.platforms?.[platformKey];
    if (!platform || typeof platform !== 'object' || Array.isArray(platform)) {
        return resolved;
    }

    for (const [key, value] of Object.entries(platform)) {
        if (PLATFORM_CONTROL_KEYS.has(key) || value === undefined) {
            continue;
        }
        resolved[key] = value;
    }

    return resolved;
}

/**
 * @param {{ config?: Record<string, unknown> }} pkg
 * @param {string | null | undefined} platformKey
 * @param {string} key
 * @param {unknown} [fallback]
 */
export function getConfigValue(pkg, platformKey, key, fallback) {
    const resolved = resolvePlatformConfig(pkg, platformKey);
    return resolved[key] !== undefined ? resolved[key] : fallback;
}

/**
 * Prefer a platform whose key matches the deployment key (e.g. deploy "android"
 * → platforms.android), else the build's platformKey.
 *
 * @param {{ config?: Record<string, unknown> }} pkg
 * @param {{ platformKey?: string | null, deploymentKey?: string | null }} [context]
 */
export function resolveConfigForBuild(pkg, context = {}) {
    const { platformKey = null, deploymentKey = null } = context;
    const platforms = pkg?.config?.platforms;

    if (
        deploymentKey
        && platforms
        && typeof platforms === 'object'
        && platforms[deploymentKey]
    ) {
        return resolvePlatformConfig(pkg, deploymentKey);
    }

    return resolvePlatformConfig(pkg, platformKey);
}
