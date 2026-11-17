/* global window */

/**
 * Shared helpers for Adaptfully capture plugins.
 */
(function registerCaptureHelpers(ns) {
    ns.capture = ns.capture || {};

    ns.capture.helpers = {
        /**
         * Normalize plugin / bridge results to a PNG/JPEG data URL or null.
         * @param {unknown} result
         * @returns {string|null}
         */
        normalizeDataUrl(result) {
            if (!result) {
                return null;
            }

            if (typeof result === 'string') {
                return result.startsWith('data:image/') ? result : null;
            }

            if (typeof result === 'object') {
                if (result.unsupported === true) {
                    return null;
                }

                const dataUrl = result.dataUrl || result.dataURL;
                if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                    return dataUrl;
                }

                if (typeof result.base64 === 'string' && result.base64.length) {
                    return `data:image/png;base64,${result.base64}`;
                }
            }

            return null;
        },
    };
}(window.adaptfully));
