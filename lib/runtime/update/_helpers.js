/* global window */

/**
 * Shared helpers for Adaptfully update plugins.
 *
 * Games register an update backend (pwa-update / noop-update) and call:
 *   const update = adaptfully.get('update');
 *   update.check();
 *   update.on('status', (s) => { ... });
 *   update.applyAndReload();
 *   update.startPeriodicCheck(15 * 60 * 1000); // opt-in; default off
 *
 * Status states: unsupported | idle | checking | downloading | ready | error
 *
 * PWA factory options: adaptfully.update.Pwa({ checkIntervalMs: 900000 })
 * — when checkIntervalMs > 0, polls registration.update() while the tab is
 * visible. Default 0 so existing PWAs that only call Pwa() are unchanged.
 *
 * PWA skip-waiting handshake: postMessage({ type: 'SKIP_WAITING' }) to the
 * waiting worker. Wrapfully-generated service workers should call
 * self.skipWaiting() when they receive that message, then clients.claim().
 */
(function registerUpdateHelpers(ns) {
    ns.update = ns.update || {};

    /** Message type waiting SWs must honor to activate. */
    ns.update.SKIP_WAITING_TYPE = 'SKIP_WAITING';

    /** Optional SW → page progress: { type, progress: 0..1 }. */
    ns.update.PROGRESS_TYPE = 'ADAPTFULLY_UPDATE_PROGRESS';

    /**
     * Minimal event emitter for status updates.
     * @returns {{ on: Function, off: Function, emit: Function }}
     */
    ns.update.createEmitter = function createEmitter() {
        /** @type {Record<string, Function[]>} */
        const listeners = {};
        return {
            on(event, handler) {
                if (typeof handler !== 'function') {
                    return;
                }
                if (!listeners[event]) {
                    listeners[event] = [];
                }
                listeners[event].push(handler);
            },
            off(event, handler) {
                const list = listeners[event];
                if (!list) {
                    return;
                }
                const i = list.indexOf(handler);
                if (i >= 0) {
                    list.splice(i, 1);
                }
            },
            emit(event, payload) {
                const list = listeners[event];
                if (!list) {
                    return;
                }
                for (const handler of [...list]) {
                    try {
                        handler(payload);
                    } catch (err) {
                        console.warn('adaptfully update listener error', err);
                    }
                }
            },
        };
    };
}(window.adaptfully));
