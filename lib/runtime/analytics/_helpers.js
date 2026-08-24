/* global window */

/**
 * Shared helpers for Adaptfully analytics plugins.
 *
 * Config keys (via adaptfully.get('config')):
 *   analyticsEndpoint  — POST URL for event batches
 *   analyticsGameId    — game id stamped on every event (e.g. 'entanglement')
 *   analyticsEnabled   — when false, track is a no-op (default true when endpoint set)
 *   analyticsPlatform  — optional override; else window.gameConfig.platform
 *   analyticsAppVersion — optional override; else window.gameConfig.version / config.appVersion
 */
(function registerAnalyticsHelpers(ns) {
    const OPT_OUT_KEY = 'adaptfully_analytics_opt_out';

    const helpers = {
        configValue(key, fallback) {
            if (!ns.has('config')) {
                return fallback;
            }
            const config = ns.get('config');
            if (config && config[key] != null) {
                return config[key];
            }
            return fallback;
        },

        getStorage() {
            return ns.has('storage') ? ns.get('storage') : null;
        },

        readOptOut() {
            const storage = helpers.getStorage();
            if (!storage) {
                return false;
            }
            try {
                const raw = storage.get(OPT_OUT_KEY);
                return raw === true || raw === 'true' || raw === '1';
            } catch {
                return false;
            }
        },

        writeOptOut(value) {
            const storage = helpers.getStorage();
            if (!storage) {
                return;
            }
            try {
                if (value) {
                    storage.set(OPT_OUT_KEY, 'true');
                } else {
                    storage.remove(OPT_OUT_KEY);
                }
            } catch {
                // ignore quota / private browsing
            }
        },

        resolvePlatform() {
            const fromConfig = helpers.configValue('analyticsPlatform', null);
            if (fromConfig) {
                return String(fromConfig);
            }
            try {
                if (typeof window !== 'undefined' && window.gameConfig && window.gameConfig.platform) {
                    return String(window.gameConfig.platform);
                }
            } catch {
                // ignore
            }
            return 'unknown';
        },

        resolveAppVersion() {
            const fromConfig = helpers.configValue('analyticsAppVersion', null)
                || helpers.configValue('appVersion', null);
            if (fromConfig) {
                return String(fromConfig);
            }
            try {
                if (typeof window !== 'undefined' && window.gameConfig && window.gameConfig.version) {
                    return String(window.gameConfig.version);
                }
            } catch {
                // ignore
            }
            return '';
        },

        resolveGameId() {
            const fromConfig = helpers.configValue('analyticsGameId', null);
            if (fromConfig) {
                return String(fromConfig);
            }
            try {
                if (typeof window !== 'undefined' && window.gameConfig && window.gameConfig.id) {
                    return String(window.gameConfig.id);
                }
            } catch {
                // ignore
            }
            return 'unknown';
        },

        createSessionId() {
            try {
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    return crypto.randomUUID();
                }
            } catch {
                // ignore
            }
            return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        },

        sanitizeProps(props) {
            if (!props || typeof props !== 'object' || Array.isArray(props)) {
                return {};
            }
            const out = {};
            for (const [key, value] of Object.entries(props)) {
                if (value === undefined) {
                    continue;
                }
                const t = typeof value;
                if (t === 'string' || t === 'number' || t === 'boolean' || value === null) {
                    out[key] = value;
                }
            }
            return out;
        },
    };

    ns.analytics = ns.analytics || {};
    ns.analytics.helpers = helpers;
    ns.analytics.OPT_OUT_KEY = OPT_OUT_KEY;
}(window.adaptfully));
