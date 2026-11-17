/* global window */

/**
 * Electron capture via Adaptfully-generated preload IPC (webContents.capturePage).
 */
(function registerElectronCapture(ns) {
    const {normalizeDataUrl} = ns.capture.helpers;

    function resolveElectronBridge() {
        return window.__ADAPTFULLY_CAPTURE__ || null;
    }

    ns.capture.Electron = function electronCaptureFactory() {
        return {
            name: 'electron',

            async screenshot() {
                const bridge = resolveElectronBridge();
                if (!bridge || typeof bridge.screenshot !== 'function') {
                    return null;
                }

                try {
                    const result = await bridge.screenshot();
                    return normalizeDataUrl(result);
                } catch (err) {
                    console.warn('adaptfully electron-capture: screenshot failed', err);
                    return null;
                }
            },
        };
    };
}(window.adaptfully));
