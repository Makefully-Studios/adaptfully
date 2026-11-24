/* global window, Capacitor */

/**
 * Capacitor file open/save via Capawesome FilePicker + Filesystem/Share.
 * Wrapfully installs plugins when registrations.files is capacitor-files.
 */
(function registerCapacitorFiles(ns) {
    const {
        normalizeOpenOptions,
        normalizeOpenResult,
        normalizeSaveOptions,
    } = ns.files.helpers;

    function resolvePlugin(name) {
        const plugins = window.Capacitor?.Plugins;
        if (plugins?.[name]) {
            return plugins[name];
        }
        if (window[name]) {
            return window[name];
        }
        return null;
    }

    function isCancelError(err) {
        if (!err) {
            return false;
        }
        const message = String(err.message || err).toLowerCase();
        return message.includes('cancel')
            || message.includes('dismiss')
            || err.code === 'USER_CANCELLED'
            || err.code === 'ERROR_PICK_FILE_CANCELED';
    }

    ns.files.Capacitor = function capacitorFilesFactory() {
        return {
            name: 'capacitor',

            async open(rawOptions) {
                const picker = resolvePlugin('FilePicker');
                if (!picker || typeof picker.pickFiles !== 'function') {
                    return null;
                }

                try {
                    const options = normalizeOpenOptions(rawOptions);
                    const result = await picker.pickFiles({
                        types: options.types.length ? options.types : undefined,
                        limit: options.multiple ? 0 : 1,
                        readData: true,
                    });
                    return normalizeOpenResult(result);
                } catch (err) {
                    if (isCancelError(err)) {
                        return null;
                    }
                    console.warn('adaptfully capacitor-files: open failed', err);
                    return null;
                }
            },

            async save(rawOptions) {
                const filesystem = resolvePlugin('Filesystem');
                if (!filesystem || typeof filesystem.writeFile !== 'function') {
                    console.warn('adaptfully capacitor-files: Filesystem plugin missing');
                    return null;
                }

                try {
                    const options = await normalizeSaveOptions(rawOptions);
                    const fileName = options.name.replace(/[\\/]/g, '_');
                    const written = await filesystem.writeFile({
                        path: fileName,
                        data: options.base64,
                        directory: 'CACHE',
                        recursive: true,
                    });

                    const uri = written?.uri || written?.path;
                    const share = resolvePlugin('Share');
                    if (share && typeof share.share === 'function' && uri) {
                        try {
                            await share.share({
                                title: options.name,
                                files: [uri],
                            });
                        } catch (err) {
                            if (isCancelError(err)) {
                                return null;
                            }
                            console.warn('adaptfully capacitor-files: Share failed after write', err);
                        }
                    } else {
                        console.warn('adaptfully capacitor-files: Share unavailable; file written to cache only');
                    }

                    return { name: options.name };
                } catch (err) {
                    console.warn('adaptfully capacitor-files: save failed', err);
                    return null;
                }
            },
        };
    };
}(window.adaptfully));
