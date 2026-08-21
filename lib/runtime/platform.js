/* global window */

(function registerPlatform(ns) {
    class Platform {
        /**
         * @param {object} authPlugin
         */
        constructor(authPlugin) {
            this.auth = authPlugin;
            this.online = true;
            this.#ready = false;
            this.#queue = [];

            authPlugin.whenReady((err) => {
                if (err) {
                    this.online = false;
                }
                this.#ready = true;
                const queue = this.#queue;
                this.#queue = [];
                for (const callback of queue) {
                    callback();
                }
            });
        }

        /** @type {boolean} */
        #ready;

        /** @type {Array<() => void>} */
        #queue;

        whenReady(callback) {
            if (this.#ready) {
                callback();
                return;
            }
            this.#queue.push(callback);
        }

        login(callback) {
            this.whenReady(() => {
                if (!this.online) {
                    callback({ authenticated: false });
                    return;
                }
                this.auth.login((result) => {
                    callback(result || {
                        authenticated: this.auth.isAuthenticated(),
                        user: this.auth.getUser(),
                    });
                });
            });
        }

        autoLogin(callback) {
            this.whenReady(() => {
                if (!this.online) {
                    callback({ authenticated: false });
                    return;
                }
                if (typeof this.auth.autoLogin !== 'function') {
                    callback({ authenticated: false });
                    return;
                }
                this.auth.autoLogin((result) => {
                    callback(result || {
                        authenticated: this.auth.isAuthenticated(),
                        user: this.auth.getUser(),
                    });
                });
            });
        }

        supportsAutoLogin() {
            return typeof this.auth.supportsAutoLogin === 'function'
                ? this.auth.supportsAutoLogin()
                : typeof this.auth.autoLogin === 'function';
        }

        /**
         * Whether logout() yields a durable signed-out state for this auth backend.
         * Games should hide Sign out UI when this is false (e.g. Steam).
         * Defaults to false when the plugin does not implement the method.
         */
        supportsLogout() {
            return typeof this.auth.supportsLogout === 'function'
                ? this.auth.supportsLogout()
                : false;
        }

        /**
         * Whether a complete identity requires email in addition to id.
         * Id-only backends (Steam) return false. Defaults to true when unimplemented.
         */
        requiresEmail() {
            return typeof this.auth.requiresEmail === 'function'
                ? this.auth.requiresEmail()
                : true;
        }

        logout(callback) {
            this.whenReady(() => {
                this.auth.logout(() => {
                    callback({ authenticated: false });
                });
            });
        }

        getUser() {
            return this.auth.getUser();
        }

        isAuthenticated() {
            return this.auth.isAuthenticated();
        }
    }

    ns.Platform = Platform;
}(window.adaptfully));
