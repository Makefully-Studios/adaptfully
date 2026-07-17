/* global window */

/**
 * Social auth via @capgo/capacitor-social-login.
 * Adaptfully prebuild writes social-login-config.js and Wrapfully installs the Capgo plugin
 * when packager is "capacitor" and registrations.auth is "social-auth".
 */
(function registerSocialAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';
    const READY_POLL_MS = 50;
    const READY_TIMEOUT_MS = 10000;

    function readSocialLoginConfig() {
        return window.__ADAPTFULLY_SOCIAL_LOGIN__ || {};
    }

    function resolveSocialLoginPlugin() {
        const plugins = window.Capacitor?.Plugins;
        if (plugins?.SocialLogin) {
            return plugins.SocialLogin;
        }
        if (window.SocialLogin) {
            return window.SocialLogin;
        }
        return null;
    }

    function mapLoginResult(result) {
        const resultResult = result?.result ?? result;
        const profile = resultResult?.profile
            || resultResult?.user
            || resultResult
            || {};
        const id = String(
            profile.id
            || profile.user
            || profile.sub
            || resultResult?.accessToken?.userId
            || resultResult?.idToken
            || '',
        );
        const email = String(profile.email || '');

        if (!id && !email) {
            return null;
        }

        return {
            id: id || email,
            email,
            displayName: profile.name || profile.givenName || '',
        };
    }

    class SocialAuthPlugin {
        constructor() {
            this.name = 'social';
            this.user = null;
            this.authenticated = false;
            this.online = false;
            this.#plugin = null;
            this.#provider = null;
        }

        /** @type {object | null} */
        #plugin;

        /** @type {string | null} */
        #provider;

        supportsAutoLogin() {
            return true;
        }

        #autoLoginStorageKey() {
            return configValue('autoLoginStorageKey', DEFAULT_AUTO_LOGIN_KEY);
        }

        #config() {
            return readSocialLoginConfig();
        }

        #resolveDefaultProvider() {
            const config = this.#config();
            if (config.defaultProvider) {
                return config.defaultProvider;
            }
            const platform = config.platform || window.gameConfig?.platform || '';
            if (String(platform).startsWith('ios')) {
                return config.providers?.apple === false ? 'google' : 'apple';
            }
            return config.providers?.google === false ? 'apple' : 'google';
        }

        #buildInitializeOptions() {
            const config = this.#config();
            const options = {};

            if (config.providers?.google !== false) {
                options.google = {
                    webClientId: config.google?.webClientId
                        || configValue('googleClientId', ''),
                    iOSClientId: config.google?.iOSClientId,
                    iOSServerClientId: config.google?.iOSServerClientId
                        || config.google?.webClientId,
                    mode: config.google?.mode || 'online',
                };
            }

            if (config.providers?.apple !== false) {
                options.apple = {
                    clientId: config.apple?.clientId || '',
                    redirectUrl: config.apple?.redirectUrl,
                    useProperTokenExchange: config.apple?.useProperTokenExchange !== false,
                    useBroadcastChannel: config.apple?.useBroadcastChannel !== false,
                };
            }

            return options;
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

        #complete(callback) {
            callback({
                authenticated: this.authenticated,
                user: this.getUser(),
            });
        }

        whenReady(done) {
            const started = Date.now();
            const timeoutMs = Number(configValue('socialReadyTimeoutMs', READY_TIMEOUT_MS))
                || READY_TIMEOUT_MS;

            const finish = async () => {
                const plugin = resolveSocialLoginPlugin();
                if (!plugin) {
                    if (Date.now() - started >= timeoutMs) {
                        console.warn('[adaptfully social-auth] Capgo SocialLogin plugin not available');
                        this.online = false;
                        done({ error: 'SocialLogin plugin not available' });
                        return;
                    }
                    window.setTimeout(finish, READY_POLL_MS);
                    return;
                }

                this.#plugin = plugin;
                this.#provider = this.#resolveDefaultProvider();

                try {
                    await plugin.initialize(this.#buildInitializeOptions());
                    this.online = true;
                    done();
                } catch (err) {
                    console.error('[adaptfully social-auth] initialize failed:', err);
                    this.online = false;
                    done({ error: err?.message || 'SocialLogin initialize failed' });
                }
            };

            finish();
        }

        login(callback) {
            const plugin = this.#plugin ?? resolveSocialLoginPlugin();
            const provider = this.#provider ?? this.#resolveDefaultProvider();

            if (!plugin) {
                console.warn('[adaptfully social-auth] login: plugin missing');
                this.#complete(callback);
                return;
            }

            plugin.login({
                provider,
                options: {
                    scopes: provider === 'google'
                        ? ['email', 'profile']
                        : ['email', 'name'],
                },
            })
                .then((result) => {
                    if (!this.#applyIdentity(mapLoginResult(result))) {
                        console.warn('[adaptfully social-auth] login: could not map identity', result);
                    }
                    this.#complete(callback);
                })
                .catch((err) => {
                    console.error('[adaptfully social-auth] login failed:', err);
                    this.user = null;
                    this.authenticated = false;
                    this.online = false;
                    this.#complete(callback);
                });
        }

        autoLogin(callback) {
            const plugin = this.#plugin ?? resolveSocialLoginPlugin();
            const provider = this.#provider ?? this.#resolveDefaultProvider();
            const storage = getStorage();
            const lastId = storage?.get?.(this.#autoLoginStorageKey());

            if (!plugin || typeof plugin.isLoggedIn !== 'function') {
                if (lastId) {
                    this.#applyIdentity({ id: String(lastId), email: '' });
                }
                this.#complete(callback);
                return;
            }

            plugin.isLoggedIn({ provider })
                .then(async (status) => {
                    if (!status?.isLoggedIn) {
                        this.user = null;
                        this.authenticated = false;
                        this.#complete(callback);
                        return;
                    }

                    if (typeof plugin.getAuthorizationCode === 'function') {
                        try {
                            const auth = await plugin.getAuthorizationCode({ provider });
                            const identity = mapLoginResult(auth) || (lastId
                                ? { id: String(lastId), email: '' }
                                : null);
                            this.#applyIdentity(identity);
                            this.#complete(callback);
                            return;
                        } catch {
                            // fall through to lastId
                        }
                    }

                    if (lastId) {
                        this.#applyIdentity({ id: String(lastId), email: '' });
                    }
                    this.#complete(callback);
                })
                .catch((err) => {
                    console.warn('[adaptfully social-auth] autoLogin failed:', err);
                    this.#complete(callback);
                });
        }

        logout(callback) {
            const plugin = this.#plugin ?? resolveSocialLoginPlugin();
            const provider = this.#provider ?? this.#resolveDefaultProvider();
            const storage = getStorage();

            const clear = () => {
                this.user = null;
                this.authenticated = false;
                this.online = false;
                storage?.remove(this.#autoLoginStorageKey());
                callback();
            };

            if (!plugin || typeof plugin.logout !== 'function') {
                clear();
                return;
            }

            plugin.logout({ provider })
                .then(clear)
                .catch((err) => {
                    console.warn('[adaptfully social-auth] logout failed:', err);
                    clear();
                });
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
    }

    ns.auth.Social = () => new SocialAuthPlugin();
}(window.adaptfully));
