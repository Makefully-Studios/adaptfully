/* global google, localStorage, sessionStorage, window */

(function registerGoogleAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_SCOPES = 'openid email profile';
    const DEFAULT_TOKEN_KEY = 'adaptfully_google_token';
    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';
    const DEFAULT_TOKEN_STORAGE = 'localStorage';

    class GoogleAuthPlugin {
        constructor() {
            this.name = 'google';
            this.tokenClient = null;
            this.accessToken = '';
            this.user = null;
            this.authenticated = false;
        }

        supportsAutoLogin() {
            return true;
        }

        supportsLogout() {
            return true;
        }

        requiresEmail() {
            return true;
        }

        #tokenKey() {
            return configValue('googleTokenKey', DEFAULT_TOKEN_KEY);
        }

        /**
         * Where the GIS access token is persisted.
         * Default `localStorage` so sign-in survives browser restarts until logout
         * (or Google silent reauth fails). Use `sessionStorage` for tab-only tokens.
         */
        #tokenStorageName() {
            const raw = configValue('googleTokenStorage', DEFAULT_TOKEN_STORAGE);
            return raw === 'sessionStorage' ? 'sessionStorage' : 'localStorage';
        }

        #tokenStore() {
            try {
                if (this.#tokenStorageName() === 'sessionStorage') {
                    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
                }
                return typeof localStorage !== 'undefined' ? localStorage : null;
            } catch {
                return null;
            }
        }

        /**
         * Browser GIS OAuth client id only (`config.googleClientId`).
         * Capacitor / Capgo builds use `platforms.<name>.socialLogin.google.webClientId` instead.
         */
        #clientId() {
            const clientId = configValue('googleClientId', '');
            return typeof clientId === 'string' ? clientId.trim() : '';
        }

        #scopes() {
            return configValue('googleScopes', DEFAULT_SCOPES);
        }

        #autoLoginStorageKey() {
            return configValue('autoLoginStorageKey', DEFAULT_AUTO_LOGIN_KEY);
        }

        whenReady(done) {
            const setup = () => {
                const clientId = this.#clientId();
                if (!clientId) {
                    console.error(
                        'google-auth: config.googleClientId is required '
                        + '(browser GIS OAuth client; do not reuse socialLogin.google.webClientId).',
                    );
                    done({ error: 'google-auth: config.googleClientId is required' });
                    return;
                }
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: this.#scopes(),
                    callback: () => {},
                });
                done();
            };

            if (window.google?.accounts?.oauth2) {
                setup();
                return;
            }

            let attempts = 0;
            const timer = window.setInterval(() => {
                attempts += 1;
                if (window.google?.accounts?.oauth2) {
                    window.clearInterval(timer);
                    setup();
                } else if (attempts > 200) {
                    window.clearInterval(timer);
                    console.error('Google Identity Services failed to load.');
                    done({ error: 'Google Identity Services failed to load.' });
                }
            }, 50);
        }

        #applyUserInfo(data) {
            this.user = {
                id: data.sub || data.id || '',
                email: data.email || '',
            };
            this.authenticated = !!(this.user.id && this.user.email);
        }

        #readStoredToken() {
            const key = this.#tokenKey(),
                primary = this.#tokenStore();
            let token = '';

            try {
                token = (primary && primary.getItem(key)) || '';
            } catch {
                token = '';
            }

            // One-time migrate: older builds kept the token in sessionStorage.
            if (!token && this.#tokenStorageName() === 'localStorage') {
                try {
                    token = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) || '';
                    if (token && primary) {
                        primary.setItem(key, token);
                        sessionStorage.removeItem(key);
                    }
                } catch {
                    /* ignore quota / private-mode */
                }
            }

            return token;
        }

        #writeStoredToken(token) {
            const key = this.#tokenKey(),
                primary = this.#tokenStore();

            try {
                if (primary) {
                    primary.setItem(key, token);
                }
            } catch {
                /* ignore */
            }

            // Drop the legacy session copy so tab-close cannot leave a stale twin.
            if (this.#tokenStorageName() === 'localStorage') {
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem(key);
                    }
                } catch {
                    /* ignore */
                }
            }
        }

        #clearStoredToken() {
            const key = this.#tokenKey();

            try {
                this.#tokenStore()?.removeItem(key);
            } catch {
                /* ignore */
            }
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem(key);
                }
            } catch {
                /* ignore */
            }
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem(key);
                }
            } catch {
                /* ignore */
            }
        }

        #clearSession() {
            this.accessToken = '';
            this.user = null;
            this.authenticated = false;
            this.#clearStoredToken();
        }

        #loadStoredToken() {
            if (!this.accessToken) {
                this.accessToken = this.#readStoredToken();
            }
        }

        #hasPersistedLogin() {
            const storage = getStorage();
            const key = this.#autoLoginStorageKey();
            return !!(storage?.get(key));
        }

        #fetchUserInfo(token, callback) {
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('userinfo failed');
                    }
                    return response.json();
                })
                .then((data) => {
                    this.accessToken = token;
                    this.#writeStoredToken(token);
                    this.#applyUserInfo(data);
                    callback();
                })
                .catch(() => {
                    this.#clearSession();
                    callback();
                });
        }

        #requestAccessToken(prompt, callback) {
            this.tokenClient.callback = (response) => {
                if (response.error || !response.access_token) {
                    this.#clearSession();
                    callback();
                    return;
                }
                this.#fetchUserInfo(response.access_token, callback);
            };
            this.tokenClient.requestAccessToken({ prompt: prompt || '' });
        }

        #restoreSession(callback) {
            this.#loadStoredToken();

            const trySilentGoogleLogin = () => {
                if (this.#hasPersistedLogin()) {
                    this.#requestAccessToken('none', callback);
                } else {
                    this.#clearSession();
                    callback();
                }
            };

            if (this.accessToken) {
                this.#fetchUserInfo(this.accessToken, () => {
                    if (this.authenticated) {
                        callback();
                        return;
                    }
                    trySilentGoogleLogin();
                });
                return;
            }
            trySilentGoogleLogin();
        }

        login(callback) {
            if (this.authenticated) {
                callback({ authenticated: true, user: this.getUser() });
                return;
            }
            this.#requestAccessToken('select_account', () => {
                callback({ authenticated: this.authenticated, user: this.getUser() });
            });
        }

        autoLogin(callback) {
            if (this.authenticated && this.user?.id) {
                callback({ authenticated: true, user: this.getUser() });
                return;
            }
            this.#restoreSession(() => {
                callback({ authenticated: this.authenticated, user: this.getUser() });
            });
        }

        logout(callback) {
            const storage = getStorage();
            const finish = () => {
                this.#clearSession();
                storage?.remove(this.#autoLoginStorageKey());
                callback();
            };

            if (this.accessToken && google.accounts?.oauth2) {
                google.accounts.oauth2.revoke(this.accessToken, finish);
            } else {
                finish();
            }
        }

        getUser() {
            if (!this.authenticated || !this.user) {
                return null;
            }
            return { id: this.user.id, email: this.user.email };
        }

        isAuthenticated() {
            return !!this.authenticated;
        }
    }

    ns.auth.Google = () => new GoogleAuthPlugin();
}(window.adaptfully));
