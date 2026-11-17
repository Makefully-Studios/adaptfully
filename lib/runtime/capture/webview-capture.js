/* global window */

/**
 * Capacitor WKWebView / WebView capture via @makefully/capacitor-screenshot.
 * Wrapfully installs the native plugin when registrations.capture is webview-capture.
 */
(function registerWebviewCapture(ns) {
    const {normalizeDataUrl} = ns.capture.helpers;

    function resolveScreenshotPlugin() {
        const plugins = window.Capacitor?.Plugins;
        if (plugins?.Screenshot) {
            return plugins.Screenshot;
        }
        if (window.Screenshot) {
            return window.Screenshot;
        }
        return null;
    }

    ns.capture.Webview = function webviewCaptureFactory() {
        return {
            name: 'webview',

            async screenshot() {
                const plugin = resolveScreenshotPlugin();
                if (!plugin || typeof plugin.take !== 'function') {
                    return null;
                }

                try {
                    const result = await plugin.take();
                    return normalizeDataUrl(result);
                } catch (err) {
                    console.warn('adaptfully webview-capture: take failed', err);
                    return null;
                }
            },
        };
    };
}(window.adaptfully));
