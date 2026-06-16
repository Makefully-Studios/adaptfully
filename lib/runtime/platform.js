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

        silentLogin(callback) {
            this.whenReady(() => {
                if (!this.online) {
                    callback({ authenticated: false });
                    return;
                }
                this.auth.silentLogin((result) => {
                    callback(result || {
                        authenticated: this.auth.isAuthenticated(),
                        user: this.auth.getUser(),
                    });
                });
            });
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
