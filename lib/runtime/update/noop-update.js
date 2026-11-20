/* global window */

/**
 * No-op update channel — always `unsupported`.
 * Use on platforms without an in-app update path (or until Electron is wired).
 */
(function registerNoopUpdate(ns) {
    ns.update.Noop = function noopUpdateFactory() {
        const emitter = ns.update.createEmitter();
        const status = {
            state: 'unsupported',
            progress: undefined,
            error: undefined,
        };

        return {
            name: 'noop',

            getStatus() {
                return { ...status };
            },

            check() {
                emitter.emit('status', this.getStatus());
                return Promise.resolve(this.getStatus());
            },

            applyAndReload() {
                return Promise.reject(new Error('adaptfully: update is unsupported on this platform'));
            },

            startPeriodicCheck() {},

            stopPeriodicCheck() {},

            on(event, handler) {
                emitter.on(event, handler);
            },

            off(event, handler) {
                emitter.off(event, handler);
            },
        };
    };
}(window.adaptfully));
