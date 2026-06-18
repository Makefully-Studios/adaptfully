/* global window */

/**
 * Steam auth plugin — placeholder for Electron / NW.js Steam deployments.
 * Wire Steamworks login here; games only talk to adaptfully.get('auth').
 */
(function registerSteamAuth(ns) {
    const { getStorage } = ns.auth.helpers;

    class SteamAuthPlugin {
        constructor() {
            this.name = 'steam';
            this.user = null;
            this.authenticated = false;
        }

        whenReady(done) {
            done();
        }

        login(callback) {
            callback({ authenticated: this.authenticated, user: this.getUser() });
        }

        autoLogin(callback) {
            callback({ authenticated: this.authenticated, user: this.getUser() });
        }

        supportsAutoLogin() {
            return false;
        }

        logout(callback) {
            const storage = getStorage();
            this.user = null;
            this.authenticated = false;
            storage?.remove('lastLoggedIn');
            callback();
        }

        getUser() {
            if (!this.authenticated || !this.user) {
                return null;
            }
            return { id: this.user.id, email: this.user.email || '' };
        }

        isAuthenticated() {
            return !!this.authenticated;
        }
    }

    ns.auth.Steam = () => new SteamAuthPlugin();
}(window.adaptfully));
