/* global window */

/**
 * Steam auth via steamworks.js. Adaptfully prebuild writes Electron main.js and
 * preload.js (when packager is "electron") to expose __ADAPTFULLY_STEAMWORKS__.
 * Fallback bridges: window.steamworks, window.electronAPI, etc.
 */
(function registerSteamAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';
    const READY_POLL_MS = 50;
    const READY_TIMEOUT_MS = 10000;

    function normalizeSteamId(value) {
        if (value == null || value === '') {
            return '';
        }
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return String(value);
    }

    function readSyncIdentity(client) {
        if (!client?.localplayer) {
            return null;
        }

        try {
            const steamId = client.localplayer.getSteamId?.();
            const id = normalizeSteamId(steamId?.steamId64 ?? steamId);
            if (!id) {
                return null;
            }

            const name = client.localplayer.getName?.() || '';
            return {
                id,
                email: '',
                displayName: name,
            };
        } catch {
            return null;
        }
    }

    async function readAsyncIdentity(bridge) {
        if (!bridge) {
            return null;
        }

        try {
            let steamIdRaw = bridge.getSteamId?.();
            if (steamIdRaw && typeof steamIdRaw.then === 'function') {
                steamIdRaw = await steamIdRaw;
            }

            const id = normalizeSteamId(steamIdRaw?.steamId64 ?? steamIdRaw);
            if (!id) {
                return null;
            }

            let name = '';
            if (typeof bridge.getSteamName === 'function') {
                name = await bridge.getSteamName();
            } else if (typeof bridge.getName === 'function') {
                const resolved = bridge.getName();
                name = resolved && typeof resolved.then === 'function' ? await resolved : resolved;
            }

            return {
                id,
                email: '',
                displayName: name || '',
            };
        } catch {
            return null;
        }
    }

    function resolveSteamworksClient() {
        if (typeof window.__ADAPTFULLY_STEAMWORKS__ !== 'undefined') {
            return window.__ADAPTFULLY_STEAMWORKS__;
        }
        if (window.steamworks?.localplayer) {
            return window.steamworks;
        }
        if (window.steamworksClient?.localplayer) {
            return window.steamworksClient;
        }
        return null;
    }

    function resolveAsyncBridge() {
        if (window.electronAPI?.getSteamId) {
            return window.electronAPI;
        }
        if (window.adaptfullySteam?.getSteamId) {
            return window.adaptfullySteam;
        }
        return null;
    }

    class SteamAuthPlugin {
        constructor() {
            this.name = 'steam';
            this.user = null;
            this.authenticated = false;
            this.online = false;
            this.#client = null;
        }

        /** @type {object | null} */
        #client;

        supportsAutoLogin() {
            return true;
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
                email: identity.email || '',
                displayName: identity.displayName || '',
            };
            this.authenticated = true;
            this.online = true;
            this.#persistLogin(this.user);
            return true;
        }

        async #resolveIdentity() {
            const client = this.#client ?? resolveSteamworksClient();
            if (client) {
                this.#client = client;
                return readSyncIdentity(client);
            }

            return readAsyncIdentity(resolveAsyncBridge());
        }

        #hasSteamBridge() {
            return !!(resolveSteamworksClient() || resolveAsyncBridge());
        }

        whenReady(done) {
            if (!this.#hasSteamBridge()) {
                this.online = false;
                done({ error: 'Steamworks client not available' });
                return;
            }

            const started = Date.now();
            const timeoutMs = Number(configValue('steamReadyTimeoutMs', READY_TIMEOUT_MS)) || READY_TIMEOUT_MS;

            const finish = async () => {
                const identity = await this.#resolveIdentity();
                if (identity) {
                    this.#applyIdentity(identity);
                    done();
                    return;
                }

                if (Date.now() - started >= timeoutMs) {
                    this.online = false;
                    done({ error: 'Steamworks client not available' });
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
                    this.#applyIdentity(identity);
                    this.#complete(callback);
                })
                .catch(() => {
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
                email: this.user.email || '',
            };
        }

        isAuthenticated() {
            return !!this.authenticated;
        }

        /** @returns {object | null} Initialized steamworks.js client, when exposed synchronously */
        getSteamworksClient() {
            return this.#client ?? resolveSteamworksClient();
        }
    }

    ns.auth.Steam = () => new SteamAuthPlugin();
}(window.adaptfully));
