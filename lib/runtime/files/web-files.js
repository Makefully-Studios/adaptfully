/* global window, document, Blob */

/**
 * Browser file open/save via <input type="file"> and FSA / download fallback.
 */
(function registerWebFiles(ns) {
    const {
        normalizeOpenOptions,
        normalizeOpenResult,
        normalizeSaveOptions,
    } = ns.files.helpers;

    function openWithInput(options) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.style.display = 'none';
            if (options.types.length) {
                input.accept = options.types.join(',');
            }
            input.multiple = options.multiple === true;

            let settled = false;
            const finish = (value) => {
                if (settled) {
                    return;
                }
                settled = true;
                input.remove();
                resolve(value);
            };

            input.addEventListener('change', () => {
                const list = Array.from(input.files || []);
                finish(list.length ? { files: list } : null);
            }, { once: true });

            // Cancel detection: focus returns without a change event.
            window.addEventListener('focus', () => {
                window.setTimeout(() => {
                    if (!settled) {
                        finish(null);
                    }
                }, 400);
            }, { once: true });

            document.body.appendChild(input);
            input.click();
        });
    }

    async function saveWithPicker(options) {
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: options.name,
                    types: options.mimeType
                        ? [{
                            description: options.mimeType,
                            accept: { [options.mimeType]: [] },
                        }]
                        : undefined,
                });
                const writable = await handle.createWritable();
                await writable.write(options.blob);
                await writable.close();
                return { name: handle.name || options.name };
            } catch (err) {
                if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                    return null;
                }
                console.warn('adaptfully web-files: showSaveFilePicker failed, falling back to download', err);
            }
        }

        const url = URL.createObjectURL(options.blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = options.name;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { name: options.name };
    }

    ns.files.Web = function webFilesFactory() {
        return {
            name: 'web',

            async open(rawOptions) {
                const options = normalizeOpenOptions(rawOptions);
                const result = await openWithInput(options);
                return normalizeOpenResult(result);
            },

            async save(rawOptions) {
                try {
                    const options = await normalizeSaveOptions(rawOptions);
                    return saveWithPicker(options);
                } catch (err) {
                    console.warn('adaptfully web-files: save failed', err);
                    return null;
                }
            },
        };
    };
}(window.adaptfully));
