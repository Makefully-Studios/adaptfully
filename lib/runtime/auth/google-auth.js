/* global google, sessionStorage, window */

(function registerGoogleAuth(ns) {
    const { configValue, getStorage } = ns.auth.helpers;

    const DEFAULT_CLIENT_ID = '225754014403.apps.googleusercontent.com';
    const DEFAULT_SCOPES = 'openid email profile';
    const DEFAULT_TOKEN_KEY = 'adaptfully_google_token';
    const DEFAULT_AUTO_LOGIN_KEY = 'lastLoggedIn';

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

        #tokenKey() {
            return configValue('googleTokenKey', DEFAULT_TOKEN_KEY);
        }

        #clientId() {
            return configValue('googleClientId', DEFAULT_CLIENT_ID);
        }

        #scopes() {
            return configValue('googleScopes', DEFAULT_SCOPES);
        }

        #autoLoginStorageKey() {
            return configValue('autoLoginStorageKey', DEFAULT_AUTO_LOGIN_KEY);
        }

        whenReady(done) {
            const setup = () => {
                this.tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: this.#clientId(),
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

        #clearSession() {
            this.accessToken = '';
            this.user = null;
            this.authenticated = false;
            sessionStorage.removeItem(this.#tokenKey());
        }

        #loadStoredToken() {
            if (!this.accessToken) {
                this.accessToken = sessionStorage.getItem(this.#tokenKey()) || '';
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
                    sessionStorage.setItem(this.#tokenKey(), token);
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
