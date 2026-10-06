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

    function capacitorPlatform() {
        try {
            return window.Capacitor?.getPlatform?.() || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /** Capgo / Android bridge often rejects with an empty-message Error. */
    function formatAuthError(err) {
        if (err == null) {
            return { message: 'unknown error' };
        }
        if (typeof err === 'string') {
            return { message: err };
        }

        const message = err.message
            || err.errorMessage
            || err.error_description
            || (typeof err.error === 'string' ? err.error : '')
            || '';
        const out = {
            message: message || '(empty message)',
            name: err.name || undefined,
            code: err.code ?? err.errorCode ?? err.statusCode ?? undefined,
        };

        if (err.data != null) {
            out.data = err.data;
        }
        if (err.error != null && typeof err.error === 'object') {
            out.nested = formatAuthError(err.error);
        }
        if (err.stack) {
            out.stack = String(err.stack).split('\n').slice(0, 6).join('\n');
        }

        // Empty / generic "Error" from the Android bridge — dump own props.
        if (!message || message === 'Error' || message === '[object Object]') {
            try {
                out.raw = JSON.stringify(err, Object.getOwnPropertyNames(Object(err)));
            } catch {
                out.raw = String(err);
            }
        }

        return out;
    }

    function maskClientId(id) {
        const value = String(id || '');
        if (!value) {
            return null;
        }
        if (value.length <= 12) {
            return `${value.slice(0, 4)}…`;
        }
        return `${value.slice(0, 8)}…${value.slice(-6)}`;
    }

    function authContext(extra = {}) {
        const config = readSocialLoginConfig();
        return {
            platform: capacitorPlatform(),
            defaultProvider: config.defaultProvider || null,
            providers: config.providers || null,
            googleWebClientId: maskClientId(config.google?.webClientId),
            appleClientIdConfigured: !!(config.apple?.clientId || window.gameConfig?.packageName),
            hasCapacitor: !!window.Capacitor,
            hasSocialLoginPlugin: !!resolveSocialLoginPlugin(),
            ...extra,
        };
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

        supportsLogout() {
            return true;
        }

        requiresEmail() {
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
                // Capgo webClientId comes only from platforms.<name>.socialLogin
                // (written to __ADAPTFULLY_SOCIAL_LOGIN__). Do not fall back to
                // config.googleClientId — that key is for browser google-auth / GIS.
                options.google = {
                    webClientId: config.google?.webClientId || '',
                    iOSClientId: config.google?.iOSClientId,
                    iOSServerClientId: config.google?.iOSServerClientId
                        || config.google?.webClientId,
                    mode: config.google?.mode || 'online',
                };
            }

            if (config.providers?.apple !== false) {
                options.apple = {
                    clientId: config.apple?.clientId
                        || window.gameConfig?.packageName
                        || '',
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
                        console.warn(
                            '[adaptfully social-auth] Capgo SocialLogin plugin not available',
                            authContext({ waitedMs: Date.now() - started }),
                        );
                        this.online = false;
                        done({ error: 'SocialLogin plugin not available' });
                        return;
                    }
                    window.setTimeout(finish, READY_POLL_MS);
                    return;
                }

                this.#plugin = plugin;
                this.#provider = this.#resolveDefaultProvider();

                const initOptions = this.#buildInitializeOptions();
                console.info('[adaptfully social-auth] initializing', authContext({
                    provider: this.#provider,
                    googleMode: initOptions.google?.mode || null,
                    googleWebClientIdPresent: !!initOptions.google?.webClientId,
                }));

                try {
                    await plugin.initialize(initOptions);
                    this.online = true;
                    console.info('[adaptfully social-auth] initialize ok', authContext({
                        provider: this.#provider,
                    }));
                    done();
                } catch (err) {
                    console.error(
                        '[adaptfully social-auth] initialize failed:',
                        formatAuthError(err),
                        authContext({ provider: this.#provider }),
                    );
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
                console.warn('[adaptfully social-auth] login: plugin missing', authContext({
                    provider,
                }));
                this.#complete(callback);
                return;
            }

            // Android Capgo defaults / Family Link: never filter to "authorized"
            // accounts only — that path commonly surfaces [16] Account reauth failed.
            const options = provider === 'google'
                ? {
                    scopes: ['email', 'profile'],
                    filterByAuthorizedAccounts: false,
                }
                : {
                    scopes: ['email', 'name'],
                };

            console.info('[adaptfully social-auth] login starting', authContext({
                provider,
                scopes: options.scopes,
                filterByAuthorizedAccounts: options.filterByAuthorizedAccounts ?? null,
                alreadyAuthenticated: this.authenticated,
            }));

            plugin.login({ provider, options })
                .then((result) => {
                    const identity = mapLoginResult(result);
                    if (!this.#applyIdentity(identity)) {
                        const keys = result && typeof result === 'object'
                            ? Object.keys(result)
                            : [];
                        console.warn(
                            '[adaptfully social-auth] login: could not map identity',
                            authContext({
                                provider,
                                resultKeys: keys,
                                hasResultResult: !!(result && result.result),
                                profileKeys: result?.result?.profile
                                    ? Object.keys(result.result.profile)
                                    : (result?.profile ? Object.keys(result.profile) : []),
                            }),
                        );
                    } else {
                        console.info('[adaptfully social-auth] login ok', authContext({
                            provider,
                            hasEmail: !!identity.email,
                            idLength: String(identity.id || '').length,
                        }));
                    }
                    this.#complete(callback);
                })
                .catch((err) => {
                    console.error(
                        '[adaptfully social-auth] login failed:',
                        formatAuthError(err),
                        authContext({ provider }),
                    );
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
                        } catch (err) {
                            console.warn(
                                '[adaptfully social-auth] autoLogin getAuthorizationCode failed:',
                                formatAuthError(err),
                                authContext({ provider, hasLastId: !!lastId }),
                            );
                        }
                    }

                    if (lastId) {
                        this.#applyIdentity({ id: String(lastId), email: '' });
                    }
                    this.#complete(callback);
                })
                .catch((err) => {
                    console.warn(
                        '[adaptfully social-auth] autoLogin failed:',
                        formatAuthError(err),
                        authContext({ provider }),
                    );
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
                    console.warn(
                        '[adaptfully social-auth] logout failed:',
                        formatAuthError(err),
                        authContext({ provider }),
                    );
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
