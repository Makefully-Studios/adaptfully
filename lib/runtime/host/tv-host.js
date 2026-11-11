/* global window */

/**
 * Lean-back TV host (LG webOS and similar).
 * Handles Back key → history/back listeners and exposes environment "tv".
 * Listen for adaptfully:device-auth to render PIN/QR chrome in the game UI.
 *
 *   adaptfully.register('host', adaptfully.host.Tv);
 */
(function registerTvHost(ns) {
    const { helpers } = ns.host;

    ns.host.Tv = function tvHostFactory() {
        const pauseListeners = [];
        const captionsListeners = [];
        const volumeListeners = {
            sound: [],
            music: [],
            vo: [],
            sfx: [],
        };
        const backListeners = [];
        const deviceAuthListeners = [];
        let features = null;
        /** @type {Array<() => void>} */
        const cleanups = [];

        function onKeyDown(event) {
            const key = event.key || '';
            const keyCode = event.keyCode || event.which;
            // webOS Back / Escape / browser Back
            const isBack = key === 'Backspace'
                || key === 'Escape'
                || key === 'XF86Back'
                || keyCode === 461
                || keyCode === 27
                || keyCode === 8;
            if (!isBack) {
                return;
            }
            if (backListeners.length === 0) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            helpers.emit(backListeners, { key, keyCode });
        }

        function onDeviceAuth(event) {
            helpers.emit(deviceAuthListeners, event?.detail || null);
        }

        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('adaptfully:device-auth', onDeviceAuth);
        cleanups.push(() => window.removeEventListener('keydown', onKeyDown, true));
        cleanups.push(() => window.removeEventListener('adaptfully:device-auth', onDeviceAuth));

        return {
            kind: 'tv',

            getEnvironment() {
                return Promise.resolve('tv');
            },

            onPause(cb) {
                return helpers.subscribe(pauseListeners, cb);
            },

            onCaptionsMuted(cb) {
                return helpers.subscribe(captionsListeners, cb);
            },

            onVolume(channel, cb) {
                const list = volumeListeners[channel];
                if (!list) {
                    return () => {};
                }
                return helpers.subscribe(list, cb);
            },

            /** Magix Remote / webOS Back */
            onBack(cb) {
                return helpers.subscribe(backListeners, cb);
            },

            /** Forwarded adaptfully:device-auth detail for PIN/QR UI */
            onDeviceAuth(cb) {
                return helpers.subscribe(deviceAuthListeners, cb);
            },

            setFeatures(next) {
                features = next && typeof next === 'object' ? { ...next } : next;
            },

            notifyLoaded() {},

            notifyProgress(_progress, _detail) {},

            notifyEndGame(_payload) {},

            send(_event, _data) {},

            dispose() {
                while (cleanups.length) {
                    try {
                        cleanups.pop()();
                    } catch {
                        // ignore
                    }
                }
            },

            /** @internal */
            _getState() {
                return {
                    features,
                    backListeners: backListeners.length,
                    deviceAuthListeners: deviceAuthListeners.length,
                };
            },
        };
    };
}(window.adaptfully));
