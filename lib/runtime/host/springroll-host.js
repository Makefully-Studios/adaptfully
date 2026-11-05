/* global window */

/**
 * SpringRoll / SpringrollContainer host adapter.
 * Speaks the Bellhop vocabulary via Application.state + container.send.
 *
 * After creating a springroll.Application, call host.bind(app) so pause/volumes
 * wire to Application.state and notify* go through app.container.
 */
(function registerSpringrollHost(ns) {
    const { helpers } = ns.host;

    const VOLUME_CHANNELS = ['sound', 'music', 'vo', 'sfx'];

    /**
     * @param {object | null | undefined} app SpringRoll Application-like
     */
    function containerOf(app) {
        return app?.container || null;
    }

    ns.host.Springroll = function springrollHostFactory(options = {}) {
        /** @type {object | null} */
        let app = options.app || null;
        const pauseListeners = [];
        const captionsListeners = [];
        /** @type {Record<string, Array<(v: unknown) => void>>} */
        const volumeListeners = {
            sound: [],
            music: [],
            vo: [],
            sfx: [],
        };
        /** @type {Array<() => void>} */
        let propertyUnsubs = [];
        let features = options.features || null;

        function tearDownProperties() {
            for (const unsub of propertyUnsubs) {
                try {
                    unsub();
                } catch {
                    // ignore
                }
            }
            propertyUnsubs = [];
        }

        function wireProperties() {
            tearDownProperties();
            if (!app?.state) {
                return;
            }

            propertyUnsubs.push(helpers.subscribeProperty(app.state.pause, (v) => {
                helpers.emit(pauseListeners, Boolean(v));
            }));
            propertyUnsubs.push(helpers.subscribeProperty(app.state.captionsMuted, (v) => {
                helpers.emit(captionsListeners, Boolean(v));
            }));

            for (const channel of VOLUME_CHANNELS) {
                const propName = `${channel}Volume`;
                propertyUnsubs.push(helpers.subscribeProperty(app.state[propName], (v) => {
                    helpers.emit(volumeListeners[channel], Number(v));
                }));
            }
        }

        if (app) {
            wireProperties();
        }

        function send(event, data) {
            const container = containerOf(app);
            if (container && typeof container.send === 'function') {
                container.send(event, data);
            }
        }

        return {
            kind: 'springroll',

            /**
             * Attach a SpringRoll Application (required for pause/volumes/notify*).
             * @param {object} application
             */
            bind(application) {
                app = application || null;
                wireProperties();
                if (features != null) {
                    send('features', features);
                }
                return this;
            },

            getEnvironment() {
                return Promise.resolve('springroll');
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
                if (features != null) {
                    send('features', features);
                }
            },

            notifyLoaded() {
                send('loaded');
            },

            notifyProgress(progress, detail) {
                const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
                send('progress', clamped);
                if (detail != null) {
                    send('loading', typeof detail === 'object'
                        ? { ...detail, progress: clamped }
                        : { progress: clamped, detail });
                }
            },

            notifyEndGame(payload) {
                send('endGame', payload);
            },

            send,

            /** @internal */
            _getState() {
                return {
                    bound: Boolean(app),
                    features,
                    pauseListeners: pauseListeners.length,
                };
            },
        };
    };
}(window.adaptfully));
