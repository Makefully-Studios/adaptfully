/* global localStorage, window */

/**
 * @typedef {{ id: string, email: string }} AuthUser
 * @typedef {(result: { authenticated: boolean, user?: AuthUser | null }) => void} AuthCallback
 * @typedef {(err?: { error?: string }) => void} ReadyCallback
 *
 * @typedef {Object} AuthPlugin
 * @property {string} name
 * @property {(done: ReadyCallback) => void} whenReady
 * @property {(callback: AuthCallback) => void} login
 * @property {(callback: AuthCallback) => void} autoLogin
 * @property {() => boolean} [supportsAutoLogin]
 * @property {(callback: () => void) => void} logout
 * @property {() => AuthUser | null} getUser
 * @property {() => boolean} isAuthenticated
 */

(function registerAuthHelpers(ns) {
    /** @type {ReturnType<typeof createDefaultStorage> | undefined} */
    let defaultStorage;

    function createDefaultStorage() {
        if (typeof localStorage !== 'undefined') {
            return {
                get(key) {
                    const value = localStorage.getItem(key);
                    return value === null ? undefined : value;
                },
                set(key, value) {
                    localStorage.setItem(key, value == null ? '' : String(value));
                },
                remove(key) {
                    localStorage.removeItem(key);
                },
            };
        }
        return null;
    }

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
            if (ns.has('storage')) {
                return ns.get('storage');
            }
            if (defaultStorage === undefined) {
                defaultStorage = createDefaultStorage();
            }
            return defaultStorage;
        },
    };

    ns.auth = ns.auth || {};
    ns.auth.helpers = helpers;
}(window.adaptfully));
