/* global window, navigator, fetch, Blob */

(function registerHttpAnalytics(ns) {
    const {helpers} = ns.analytics;
    const MAX_QUEUE = 50;
    const FLUSH_MS = 2000;
    const MAX_BATCH = 20;

    /**
     * HTTP analytics — batches events to config.analyticsEndpoint.
     * Works on web (https), Electron file://, and Capacitor schemes via fetch.
     */
    ns.analytics.Http = function httpAnalyticsFactory() {
        const sessionId = helpers.createSessionId();
        let userId = null;
        let context = {};
        let optedOut = helpers.readOptOut();
        /** @type {object[]} */
        let queue = [];
        let flushTimer = null;
        let flushing = false;

        function isEnabled() {
            if (optedOut) {
                return false;
            }
            const enabled = helpers.configValue('analyticsEnabled', null);
            if (enabled === false || enabled === 'false') {
                return false;
            }
            const endpoint = helpers.configValue('analyticsEndpoint', '');
            return typeof endpoint === 'string' && endpoint.length > 0;
        }

        function baseProps() {
            return {
                game: helpers.resolveGameId(),
                platform: helpers.resolvePlatform(),
                appVersion: helpers.resolveAppVersion(),
                sessionId,
                ...context,
            };
        }

        function scheduleFlush() {
            if (flushTimer != null || flushing) {
                return;
            }
            flushTimer = setTimeout(() => {
                flushTimer = null;
                flush();
            }, FLUSH_MS);
        }

        function deliver(body) {
            const endpoint = helpers.configValue('analyticsEndpoint', '');
            if (!endpoint) {
                return;
            }
            const payload = JSON.stringify(body);
            try {
                if (typeof navigator !== 'undefined'
                    && typeof navigator.sendBeacon === 'function') {
                    const blob = new Blob([payload], {type: 'application/json'});
                    if (navigator.sendBeacon(endpoint, blob)) {
                        return;
                    }
                }
            } catch {
                // fall through to fetch
            }
            try {
                fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: payload,
                    keepalive: true,
                    mode: 'cors',
                    credentials: 'omit',
                }).catch(() => {
                    // drop on failure — do not block gameplay
                });
            } catch {
                // ignore
            }
        }

        function flush() {
            if (flushing || queue.length === 0 || !isEnabled()) {
                return;
            }
            flushing = true;
            const batch = queue.splice(0, MAX_BATCH);
            const body = {
                game: helpers.resolveGameId(),
                platform: helpers.resolvePlatform(),
                appVersion: helpers.resolveAppVersion(),
                sessionId,
                userId: userId || undefined,
                events: batch,
            };
            deliver(body);
            flushing = false;
            if (queue.length > 0) {
                scheduleFlush();
            }
        }

        return {
            name: 'http',

            track(name, props) {
                if (!name || typeof name !== 'string' || !isEnabled()) {
                    return;
                }
                const event = {
                    name: String(name).slice(0, 64),
                    ts: Date.now(),
                    props: {
                        ...baseProps(),
                        ...helpers.sanitizeProps(props),
                    },
                    sessionId,
                    userId: userId || undefined,
                };
                queue.push(event);
                if (queue.length > MAX_QUEUE) {
                    queue = queue.slice(-MAX_QUEUE);
                }
                if (queue.length >= MAX_BATCH) {
                    if (flushTimer != null) {
                        clearTimeout(flushTimer);
                        flushTimer = null;
                    }
                    flush();
                } else {
                    scheduleFlush();
                }
            },

            identify(id) {
                userId = id == null || id === '' ? null : String(id).slice(0, 128);
            },

            setContext(partial) {
                if (!partial || typeof partial !== 'object') {
                    return;
                }
                context = {...context, ...helpers.sanitizeProps(partial)};
            },

            optOut() {
                optedOut = true;
                helpers.writeOptOut(true);
                queue = [];
                if (flushTimer != null) {
                    clearTimeout(flushTimer);
                    flushTimer = null;
                }
            },

            optIn() {
                optedOut = false;
                helpers.writeOptOut(false);
            },

            isOptedOut() {
                return optedOut;
            },

            /** Flush pending events immediately (page hide / tests). */
            flush,

            /** @internal test/debug */
            _getState() {
                return {userId, context, optedOut, queue: queue.slice(), sessionId};
            },
        };
    };
}(window.adaptfully));
