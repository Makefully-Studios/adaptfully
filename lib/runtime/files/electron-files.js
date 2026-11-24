/* global window */

/**
 * Electron file open/save via Adaptfully-generated preload IPC.
 */
(function registerElectronFiles(ns) {
    const {
        normalizeOpenOptions,
        normalizeOpenResult,
        normalizeSaveOptions,
    } = ns.files.helpers;

    function resolveBridge() {
        return window.__ADAPTFULLY_FILES__ || null;
    }

    ns.files.Electron = function electronFilesFactory() {
        return {
            name: 'electron',

            async open(rawOptions) {
                const bridge = resolveBridge();
                if (!bridge || typeof bridge.open !== 'function') {
                    return null;
                }

                try {
                    const options = normalizeOpenOptions(rawOptions);
                    const result = await bridge.open(options);
                    return normalizeOpenResult(result);
                } catch (err) {
                    console.warn('adaptfully electron-files: open failed', err);
                    return null;
                }
            },

            async save(rawOptions) {
                const bridge = resolveBridge();
                if (!bridge || typeof bridge.save !== 'function') {
                    return null;
                }

                try {
                    const options = await normalizeSaveOptions(rawOptions);
                    const result = await bridge.save({
                        name: options.name,
                        mimeType: options.mimeType,
                        base64: options.base64,
                    });
                    if (!result || result.cancelled === true) {
                        return null;
                    }
                    return { name: String(result.name || options.name) };
                } catch (err) {
                    console.warn('adaptfully electron-files: save failed', err);
                    return null;
                }
            },
        };
    };
}(window.adaptfully));
