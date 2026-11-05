/* global window */

/**
 * Capacitor car shell host (Android Auto / AAOS parked games).
 * Requires Wrapfully `platforms.<key>.carGames` and `@makefully/capacitor-car-games`.
 *
 * Maps Cap App pause/resume + CarGames UX restrictions → onPause.
 */
(function registerCarHost(ns) {
    const { helpers } = ns.host;

    function resolveCarGamesPlugin() {
        const plugins = window.Capacitor?.Plugins;
        if (plugins?.CarGames) {
            return plugins.CarGames;
        }
        if (window.CarGames) {
            return window.CarGames;
        }
        return null;
    }

    function resolveAppPlugin() {
        const plugins = window.Capacitor?.Plugins;
        if (plugins?.App) {
            return plugins.App;
        }
        return null;
    }

    ns.host.Car = function carHostFactory() {
        const pauseListeners = [];
        const captionsListeners = [];
        const volumeListeners = {
            sound: [],
            music: [],
            vo: [],
            sfx: [],
        };
        const uxListeners = [];
        let features = null;
        let paused = false;
        /** @type {Array<() => void>} */
        const cleanups = [];

        function setPaused(next) {
            const value = Boolean(next);
            if (value === paused) {
                return;
            }
            paused = value;
            helpers.emit(pauseListeners, paused);
        }

        function attachNativeListeners() {
            const car = resolveCarGamesPlugin();
            const app = resolveAppPlugin();

            if (app && typeof app.addListener === 'function') {
                const pauseHandle = app.addListener('pause', () => setPaused(true));
                const resumeHandle = app.addListener('resume', () => setPaused(false));
                cleanups.push(() => {
                    pauseHandle?.then?.((h) => h?.remove?.());
                    pauseHandle?.remove?.();
                });
                cleanups.push(() => {
                    resumeHandle?.then?.((h) => h?.remove?.());
                    resumeHandle?.remove?.();
                });
            }

            if (car && typeof car.addListener === 'function') {
                const pauseHandle = car.addListener('pause', (event) => {
                    const value = event?.paused;
                    setPaused(value !== false);
                });
                const uxHandle = car.addListener('uxRestrictions', (event) => {
                    helpers.emit(uxListeners, event || {});
                    if (event && event.requiresDistractionOptimization === true) {
                        setPaused(true);
                    }
                });
                cleanups.push(() => {
                    pauseHandle?.then?.((h) => h?.remove?.());
                    pauseHandle?.remove?.();
                });
                cleanups.push(() => {
                    uxHandle?.then?.((h) => h?.remove?.());
                    uxHandle?.remove?.();
                });
            }
        }

        attachNativeListeners();

        function send(event, data) {
            const car = resolveCarGamesPlugin();
            if (!car) {
                return;
            }
            if (event === 'features' && typeof car.setFeatures === 'function') {
                car.setFeatures({ features: data });
                return;
            }
            if (event === 'loaded' && typeof car.notifyLoaded === 'function') {
                car.notifyLoaded();
                return;
            }
            if (event === 'progress' && typeof car.notifyProgress === 'function') {
                car.notifyProgress({
                    progress: data,
                });
                return;
            }
            if (event === 'loading' && typeof car.notifyProgress === 'function') {
                car.notifyProgress(typeof data === 'object' ? data : { progress: data });
                return;
            }
            if (event === 'endGame' && typeof car.notifyEndGame === 'function') {
                car.notifyEndGame(data ?? {});
                return;
            }
            if (typeof car.send === 'function') {
                car.send({ event, data });
            }
        }

        return {
            kind: 'car',

            getEnvironment() {
                const car = resolveCarGamesPlugin();
                if (car && typeof car.getEnvironment === 'function') {
                    return Promise.resolve(car.getEnvironment())
                        .then((result) => {
                            if (result && typeof result === 'object' && result.environment) {
                                return String(result.environment);
                            }
                            return String(result || 'phone');
                        })
                        .catch(() => 'phone');
                }
                return Promise.resolve('phone');
            },

            onPause(cb) {
                const unsub = helpers.subscribe(pauseListeners, cb);
                if (typeof cb === 'function') {
                    cb(paused);
                }
                return unsub;
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

            onUxRestrictions(cb) {
                return helpers.subscribe(uxListeners, cb);
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

            destroy() {
                for (const cleanup of cleanups) {
                    try {
                        cleanup();
                    } catch {
                        // ignore
                    }
                }
                cleanups.length = 0;
            },

            /** @internal */
            _getState() {
                return {
                    features,
                    paused,
                    pauseListeners: pauseListeners.length,
                    hasCarPlugin: Boolean(resolveCarGamesPlugin()),
                };
            },
        };
    };
}(window.adaptfully));
