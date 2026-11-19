/* global window */

/**
 * Epic auth via the Electron EOS bridge. Adaptfully prebuild writes main.js,
 * preload.js, and eos-bridge.cjs when packager is "electron".
 * Production: Epic Games Launcher exchange-code args (`-epicuserid=`).
 * epic-dev: Dev Auth Tool helper, or EOS_DEV_ACCOUNT_ID / eos-dev-identity.json.
 */
(function registerEpicAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';
    const READY_POLL_MS = 50;
    const READY_TIMEOUT_MS = 10000;

    function normalizeIdentity(value) {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const id = value.id || value.accountId || '';
        if (!id) {
            return null;
        }

        return {
            id: String(id),
            email: '',
            displayName: value.displayName || value.epicusername || '',
        };
    }

    function resolveEosBridge() {
        if (typeof window.__ADAPTFULLY_EOS__ !== 'undefined' && window.__ADAPTFULLY_EOS__) {
            return window.__ADAPTFULLY_EOS__;
        }
        return null;
    }

    async function readIdentity(bridge) {
        if (!bridge) {
            return null;
        }

        try {
            if (typeof bridge.login === 'function') {
                return normalizeIdentity(await bridge.login());
            }
            if (typeof bridge.getIdentity === 'function') {
                return normalizeIdentity(await bridge.getIdentity());
            }
            return normalizeIdentity(bridge);
        } catch (err) {
            console.warn('[adaptfully epic-auth] EOS identity unavailable', err);
            return null;
        }
    }

    class EpicAuthPlugin {
        constructor() {
            this.name = 'epic';
            this.user = null;
            this.authenticated = false;
            this.online = false;
        }

        supportsAutoLogin() {
            return true;
        }

        supportsLogout() {
            return false;
        }

        requiresEmail() {
            return false;
        }

        #autoLoginStorageKey() {
            return configValue('autoLoginStorageKey', DEFAULT_AUTO_LOGIN_KEY);
        }

        #persistLogin(user) {
            const storage = getStorage();
            storage?.set(this.#autoLoginStorageKey(), user.id);
        }

        #applyIdentity(identity) {
            if (!identity?.id) {
                this.user = null;
                this.authenticated = false;
                this.online = false;
                return false;
            }

            this.user = {
                id: identity.id,
                email: '',
                displayName: identity.displayName || '',
            };
            this.authenticated = true;
            this.online = true;
            this.#persistLogin(this.user);
            return true;
        }

        async #resolveIdentity() {
            return readIdentity(resolveEosBridge());
        }

        whenReady(done) {
            if (!resolveEosBridge()) {
                console.warn('[adaptfully epic-auth] EOS bridge not found on window');
                this.online = false;
                done({ error: 'EOS client not available' });
                return;
            }

            const started = Date.now();
            const timeoutMs = Number(configValue('eosReadyTimeoutMs', READY_TIMEOUT_MS)) || READY_TIMEOUT_MS;

            const finish = async () => {
                const identity = await this.#resolveIdentity();
                if (identity) {
                    this.#applyIdentity(identity);
                    done();
                    return;
                }

                if (Date.now() - started >= timeoutMs) {
                    console.warn('[adaptfully epic-auth] timed out waiting for Epic identity');
                    this.online = false;
                    done({ error: 'EOS client not available' });
                    return;
                }

                window.setTimeout(finish, READY_POLL_MS);
            };

            finish();
        }

        #complete(callback) {
            callback({
                authenticated: this.authenticated,
                user: this.getUser(),
            });
        }

        login(callback) {
            this.#resolveIdentity()
                .then((identity) => {
                    if (!this.#applyIdentity(identity)) {
                        console.warn('[adaptfully epic-auth] login: no Epic identity available');
                    }
                    this.#complete(callback);
                })
                .catch((err) => {
                    console.error('[adaptfully epic-auth] login failed:', err);
                    this.user = null;
                    this.authenticated = false;
                    this.online = false;
                    this.#complete(callback);
                });
        }

        autoLogin(callback) {
            this.login(callback);
        }

        logout(callback) {
            const storage = getStorage();
            this.user = null;
            this.authenticated = false;
            this.online = false;
            storage?.remove(this.#autoLoginStorageKey());
            callback();
        }

        getUser() {
            if (!this.authenticated || !this.user) {
                return null;
            }
            return {
                id: this.user.id,
                email: '',
            };
        }

        isAuthenticated() {
            return !!this.authenticated;
        }

        /** @returns {object | null} Electron EOS bridge, when the preload exposed it */
        getEosBridge() {
            return resolveEosBridge();
        }
    }

    ns.auth.Epic = () => new EpicAuthPlugin();
}(window.adaptfully));
