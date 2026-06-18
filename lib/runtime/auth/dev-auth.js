/* global fetch, window */

/**
 * Local development auth — test values for dev builds outside the Wrapfully flow.
 *
 *   adaptfully.register('auth', adaptfully.auth.Dev);
 */
(function registerDevAuth(ns) {
    const { getStorage } = ns.auth.helpers;

    const apiBase = () => {
        if (ns.has('config')) {
            const config = ns.get('config');
            if (config && typeof config.apiBase === 'string') {
                return config.apiBase;
            }
        }
        if (typeof window.__ADAPTFULLY_API__ === 'string') {
            return window.__ADAPTFULLY_API__;
        }
        return '';
    };

    const apiGet = (path) => fetch(`${apiBase()}${path}`, { credentials: 'include' })
        .then((response) => response.json());

    class DevAuthPlugin {
        constructor() {
            this.user = { id: 'dev-local-user', email: 'dev@local' };
            this.authenticated = true;
        }

        whenReady(done) {
            done();
        }

        login(callback) {
            apiGet('/get-user')
                .then((user) => {
                    if (user?.id) {
                        this.user = { id: user.id, email: user.email || 'dev@local' };
                        this.authenticated = true;
                    }
                    callback({ authenticated: this.authenticated, user: this.getUser() });
                })
                .catch(() => {
                    this.user = { id: 'dev-local-user', email: 'dev@local' };
                    this.authenticated = true;
                    callback({ authenticated: true, user: this.getUser() });
                });
        }

        autoLogin(callback) {
            callback({ authenticated: this.authenticated, user: this.getUser() });
        }

        supportsAutoLogin() {
            return true;
        }

        logout(callback) {
            const storage = getStorage();
            this.authenticated = false;
            this.user = null;
            storage?.remove('lastLoggedIn');
            callback();
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

    ns.auth.Dev = () => new DevAuthPlugin();
}(window.adaptfully));
