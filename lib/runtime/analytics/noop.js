/* global window */

(function registerNoopAnalytics(ns) {
    const {helpers} = ns.analytics;

    /**
     * No-op analytics — same surface as http-analytics, no network.
     * Use for local/dev platforms or privacy-off builds.
     */
    ns.analytics.Noop = function noopAnalyticsFactory() {
        let userId = null;
        let context = {};
        let optedOut = helpers.readOptOut();

        return {
            name: 'noop',

            track(_name, _props) {
                // intentionally empty
            },

            identify(id) {
                userId = id == null || id === '' ? null : String(id);
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
            },

            optIn() {
                optedOut = false;
                helpers.writeOptOut(false);
            },

            isOptedOut() {
                return optedOut;
            },

            /** @internal test/debug */
            _getState() {
                return {userId, context, optedOut};
            },
        };
    };
}(window.adaptfully));
