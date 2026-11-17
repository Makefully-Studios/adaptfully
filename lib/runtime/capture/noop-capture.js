/* global window */

/**
 * No-op capture — always returns null so Notefully falls through to DOM capture.
 */
(function registerNoopCapture(ns) {
    ns.capture.Noop = function noopCaptureFactory() {
        return {
            name: 'noop',

            async screenshot() {
                return null;
            },
        };
    };
}(window.adaptfully));
