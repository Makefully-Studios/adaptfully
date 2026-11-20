/* global window, navigator, document, setInterval, clearInterval, setTimeout */

/**
 * PWA / service-worker update channel.
 *
 *   adaptfully.register('update', adaptfully.update.Pwa());
 *   adaptfully.register('update', adaptfully.update.Pwa({ checkIntervalMs: 900000 }));
 *
 * Options (all optional; defaults keep existing PWAs unchanged):
 *   checkIntervalMs — if > 0, periodically call registration.update() while the
 *                     tab is visible. Default 0 (no polling).
 *
 * States:
 *   unsupported — no serviceWorker API
 *   idle        — controlling SW, no waiting update
 *   checking    — registration.update() in flight
 *   downloading — new worker installing (optional progress from SW messages)
 *   ready       — waiting worker ready to activate
 *   error       — check/apply failed (see status.error)
 */
(function registerPwaUpdate(ns) {
    const SKIP = ns.update.SKIP_WAITING_TYPE;
    const PROGRESS = ns.update.PROGRESS_TYPE;

    ns.update.Pwa = function pwaUpdateFactory(options) {
        const opts = options && typeof options === 'object' ? options : {};
        let checkIntervalMs = typeof opts.checkIntervalMs === 'number' && opts.checkIntervalMs > 0
            ? opts.checkIntervalMs
            : 0;

        const emitter = ns.update.createEmitter();
        /** @type {{ state: string, progress?: number, error?: string }} */
        let status = {
            state: 'unsupported',
            progress: undefined,
            error: undefined,
        };
        /** @type {ServiceWorkerRegistration | null} */
        let registration = null;
        /** @type {ServiceWorker | null} */
        let waitingWorker = null;
        let reloadArmed = false;
        /** @type {ReturnType<typeof setInterval> | null} */
        let pollTimer = null;
        /** @type {ReturnType<typeof setTimeout> | null} */
        let visibilityTimer = null;

        function setStatus(partial) {
            status = { ...status, ...partial };
            emitter.emit('status', { ...status });
        }

        function hasSw() {
            return typeof navigator !== 'undefined'
                && navigator.serviceWorker
                && typeof navigator.serviceWorker.getRegistration === 'function';
        }

        function watchInstalling(worker) {
            if (!worker) {
                return;
            }
            setStatus({ state: 'downloading', progress: undefined, error: undefined });
            worker.addEventListener('statechange', () => {
                if (worker.state === 'installed') {
                    // If there is already a controller, this install is an update → waiting.
                    if (navigator.serviceWorker.controller) {
                        waitingWorker = worker;
                        setStatus({ state: 'ready', progress: 1, error: undefined });
                    } else {
                        // First install — becomes controller without "update" UX.
                        setStatus({ state: 'idle', progress: undefined, error: undefined });
                    }
                }
            });
        }

        function bindRegistration(reg) {
            registration = reg || null;
            if (!registration) {
                setStatus({ state: 'idle', progress: undefined, error: undefined });
                return;
            }

            if (registration.waiting) {
                waitingWorker = registration.waiting;
                setStatus({ state: 'ready', progress: 1, error: undefined });
            } else if (registration.installing) {
                watchInstalling(registration.installing);
            } else {
                setStatus({ state: 'idle', progress: undefined, error: undefined });
            }

            registration.addEventListener('updatefound', () => {
                watchInstalling(registration.installing);
            });
        }

        function ensureControllerReload() {
            if (reloadArmed) {
                return;
            }
            reloadArmed = true;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        }

        function stopPeriodicCheck() {
            if (pollTimer != null) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            if (visibilityTimer != null) {
                clearTimeout(visibilityTimer);
                visibilityTimer = null;
            }
        }

        /**
         * @param {number} [intervalMs] Defaults to the factory option / last value.
         */
        function startPeriodicCheck(intervalMs) {
            stopPeriodicCheck();
            const ms = typeof intervalMs === 'number' && intervalMs > 0
                ? intervalMs
                : checkIntervalMs;
            if (!ms || !hasSw()) {
                return;
            }
            checkIntervalMs = ms;
            pollTimer = setInterval(() => {
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                    return;
                }
                if (status.state === 'checking' || status.state === 'downloading') {
                    return;
                }
                // Already have a waiting worker — no need to re-fetch.
                if (status.state === 'ready') {
                    return;
                }
                void api.check();
            }, checkIntervalMs);
        }

        if (hasSw()) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event && event.data;
                if (!data || typeof data !== 'object') {
                    return;
                }
                if (data.type === PROGRESS && typeof data.progress === 'number') {
                    const progress = Math.max(0, Math.min(1, data.progress));
                    setStatus({
                        state: status.state === 'ready' ? 'ready' : 'downloading',
                        progress,
                        error: undefined,
                    });
                }
            });

            if (typeof document !== 'undefined' && document.addEventListener) {
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState !== 'visible' || !checkIntervalMs) {
                        return;
                    }
                    if (status.state === 'ready' || status.state === 'checking' || status.state === 'downloading') {
                        return;
                    }
                    // Debounce: one check shortly after the tab becomes visible again.
                    if (visibilityTimer != null) {
                        clearTimeout(visibilityTimer);
                    }
                    visibilityTimer = setTimeout(() => {
                        visibilityTimer = null;
                        void api.check();
                    }, 1000);
                });
            }

            navigator.serviceWorker.getRegistration().then((reg) => {
                bindRegistration(reg || null);
            }).catch((err) => {
                setStatus({
                    state: 'error',
                    error: err && err.message ? String(err.message) : 'service worker registration failed',
                });
            });
        }

        const api = {
            name: 'pwa',

            getStatus() {
                return { ...status };
            },

            check() {
                if (!hasSw()) {
                    setStatus({ state: 'unsupported', progress: undefined, error: undefined });
                    return Promise.resolve(this.getStatus());
                }

                setStatus({ state: 'checking', progress: undefined, error: undefined });

                return navigator.serviceWorker.getRegistration()
                    .then((reg) => {
                        if (!reg) {
                            // No SW yet — nothing to update to.
                            setStatus({ state: 'idle', progress: undefined, error: undefined });
                            return this.getStatus();
                        }
                        bindRegistration(reg);
                        return reg.update().then(() => {
                            if (reg.waiting) {
                                waitingWorker = reg.waiting;
                                setStatus({ state: 'ready', progress: 1, error: undefined });
                                return this.getStatus();
                            }
                            if (reg.installing) {
                                watchInstalling(reg.installing);
                                // Wait briefly for install → waiting before declaring idle.
                                return new Promise((resolve) => {
                                    const started = Date.now();
                                    const poll = () => {
                                        if (reg.waiting) {
                                            waitingWorker = reg.waiting;
                                            setStatus({ state: 'ready', progress: 1, error: undefined });
                                            resolve(this.getStatus());
                                            return;
                                        }
                                        if (status.state === 'ready' || status.state === 'error') {
                                            resolve(this.getStatus());
                                            return;
                                        }
                                        if (Date.now() - started > 8000) {
                                            if (status.state === 'checking' || status.state === 'downloading') {
                                                setStatus({ state: 'idle', progress: undefined, error: undefined });
                                            }
                                            resolve(this.getStatus());
                                            return;
                                        }
                                        setTimeout(poll, 100);
                                    };
                                    poll();
                                });
                            }
                            if (status.state === 'checking') {
                                setStatus({ state: 'idle', progress: undefined, error: undefined });
                            }
                            return this.getStatus();
                        });
                    })
                    .catch((err) => {
                        setStatus({
                            state: 'error',
                            error: err && err.message ? String(err.message) : 'update check failed',
                        });
                        return this.getStatus();
                    });
            },

            applyAndReload() {
                if (!hasSw()) {
                    return Promise.reject(new Error('adaptfully: no service worker'));
                }
                const worker = waitingWorker
                    || (registration && registration.waiting)
                    || null;
                if (!worker) {
                    return Promise.reject(new Error('adaptfully: no waiting service worker to activate'));
                }
                ensureControllerReload();
                try {
                    worker.postMessage({ type: SKIP });
                } catch (err) {
                    return Promise.reject(err);
                }
                return Promise.resolve();
            },

            startPeriodicCheck,
            stopPeriodicCheck,

            on(event, handler) {
                emitter.on(event, handler);
            },

            off(event, handler) {
                emitter.off(event, handler);
            },
        };

        if (checkIntervalMs > 0) {
            startPeriodicCheck(checkIntervalMs);
        }

        return api;
    };
}(window.adaptfully));
