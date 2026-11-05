/**
 * Normalize platforms.<key>.carGames for Cap parked-game (Android Auto / AAOS) builds.
 *
 * - true  → both androidAuto + automotive
 * - object → per-flag booleans (missing key = false)
 * - falsy → disabled
 *
 * @param {unknown} value
 * @returns {{ enabled: boolean, androidAuto: boolean, automotive: boolean }}
 */
export function resolveCarGames(value) {
    if (value === true) {
        return { enabled: true, androidAuto: true, automotive: true };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { enabled: false, androidAuto: false, automotive: false };
    }

    const androidAuto = value.androidAuto === true;
    const automotive = value.automotive === true;
    return {
        enabled: androidAuto || automotive,
        androidAuto,
        automotive,
    };
}

/**
 * @param {string | null | undefined} platformKey
 * @param {{ config?: { platforms?: Record<string, { carGames?: unknown }>, carGames?: unknown } }} pkg
 * @returns {unknown}
 */
export function resolvePlatformCarGames(platformKey, pkg) {
    if (platformKey && pkg?.config?.platforms?.[platformKey]?.carGames !== undefined) {
        return pkg.config.platforms[platformKey].carGames;
    }
    return pkg?.config?.carGames;
}
