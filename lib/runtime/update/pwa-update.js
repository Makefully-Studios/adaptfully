/* global window, navigator */

/**
 * PWA / service-worker update channel.
 *
 *   adaptfully.register('update', adaptfully.update.Pwa());
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

    ns.update.Pwa = function pwaUpdateFactory() {
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

            navigator.serviceWorker.getRegistration().then((reg) => {
                bindRegistration(reg || null);
            }).catch((err) => {
                setStatus({
                    state: 'error',
                    error: err && err.message ? String(err.message) : 'service worker registration failed',
                });
            });
        }

        return {
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
                            } else if (reg.installing) {
                                watchInstalling(reg.installing);
                            } else if (status.state === 'checking') {
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

            on(event, handler) {
                emitter.on(event, handler);
            },

            off(event, handler) {
                emitter.off(event, handler);
            },
        };
    };
}(window.adaptfully));
