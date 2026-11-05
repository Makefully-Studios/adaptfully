/* global window */

/**
 * No-op host — same surface as springroll-host / car-host, no shell I/O.
 * Use for local web or platforms without a container.
 */
(function registerNoopHost(ns) {
    const { helpers } = ns.host;

    ns.host.Noop = function noopHostFactory() {
        const pauseListeners = [];
        const captionsListeners = [];
        const volumeListeners = {
            sound: [],
            music: [],
            vo: [],
            sfx: [],
        };
        let features = null;

        return {
            kind: 'noop',

            getEnvironment() {
                return Promise.resolve(helpers.environmentFromGameConfig());
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

            setFeatures(next) {
                features = next && typeof next === 'object' ? { ...next } : next;
            },

            notifyLoaded() {},

            notifyProgress(_progress, _detail) {},

            notifyEndGame(_payload) {},

            send(_event, _data) {},

            /** @internal */
            _getState() {
                return { features, pauseListeners: pauseListeners.length };
            },
        };
    };
}(window.adaptfully));
