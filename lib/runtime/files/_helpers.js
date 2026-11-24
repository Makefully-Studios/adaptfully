/* global window, Blob, atob, Uint8Array, File */

/**
 * Shared helpers for Adaptfully files plugins (open / save).
 */
(function registerFilesHelpers(ns) {
    ns.files = ns.files || {};

    /**
     * @param {string} base64
     * @param {string} [mimeType]
     * @returns {Blob}
     */
    function blobFromBase64(base64, mimeType) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    }

    /**
     * @param {Blob|ArrayBuffer|Uint8Array|string} input
     * @returns {Promise<string>}
     */
    async function toBase64(input) {
        if (typeof input === 'string') {
            if (input.startsWith('data:') && input.includes(',')) {
                return input.slice(input.indexOf(',') + 1);
            }
            return input;
        }

        let blob;
        if (input instanceof Blob) {
            blob = input;
        } else if (input instanceof ArrayBuffer) {
            blob = new Blob([input]);
        } else if (ArrayBuffer.isView(input)) {
            blob = new Blob([input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)]);
        } else {
            throw new Error('adaptfully files: save requires Blob, ArrayBuffer, or Uint8Array');
        }

        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    /**
     * Normalize a single opened file descriptor into { name, mimeType, size, blob }.
     * @param {unknown} entry
     * @returns {Promise<{name: string, mimeType: string, size: number, blob: Blob}|null>}
     */
    async function normalizeOpenedFile(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }

        if (typeof File !== 'undefined' && entry instanceof File) {
            return {
                name: entry.name || 'file',
                mimeType: entry.type || 'application/octet-stream',
                size: entry.size || 0,
                blob: entry,
            };
        }

        if (entry.blob instanceof Blob) {
            return {
                name: String(entry.name || 'file'),
                mimeType: String(entry.mimeType || entry.blob.type || 'application/octet-stream'),
                size: Number(entry.size != null ? entry.size : entry.blob.size) || 0,
                blob: entry.blob,
            };
        }

        if (typeof entry.data === 'string' && entry.data.length) {
            const mimeType = String(entry.mimeType || 'application/octet-stream');
            const blob = blobFromBase64(entry.data, mimeType);
            return {
                name: String(entry.name || 'file'),
                mimeType,
                size: Number(entry.size != null ? entry.size : blob.size) || 0,
                blob,
            };
        }

        if (typeof entry.base64 === 'string' && entry.base64.length) {
            const mimeType = String(entry.mimeType || 'application/octet-stream');
            const blob = blobFromBase64(entry.base64, mimeType);
            return {
                name: String(entry.name || 'file'),
                mimeType,
                size: Number(entry.size != null ? entry.size : blob.size) || 0,
                blob,
            };
        }

        const pathOrUrl = entry.path || entry.webPath || entry.uri;
        if (typeof pathOrUrl === 'string' && pathOrUrl.length) {
            try {
                const response = await fetch(pathOrUrl);
                const blob = await response.blob();
                return {
                    name: String(entry.name || 'file'),
                    mimeType: String(entry.mimeType || blob.type || 'application/octet-stream'),
                    size: Number(entry.size != null ? entry.size : blob.size) || 0,
                    blob,
                };
            } catch (err) {
                console.warn('adaptfully files: failed to fetch opened file', err);
                return null;
            }
        }

        return null;
    }

    /**
     * @param {unknown} result
     * @returns {Promise<{files: Array<{name: string, mimeType: string, size: number, blob: Blob}>}|null>}
     */
    async function normalizeOpenResult(result) {
        if (!result) {
            return null;
        }

        const list = Array.isArray(result.files)
            ? result.files
            : (Array.isArray(result) ? result : null);

        if (!list || !list.length) {
            return null;
        }

        const files = [];
        for (const entry of list) {
            const normalized = await normalizeOpenedFile(entry);
            if (normalized) {
                files.push(normalized);
            }
        }

        return files.length ? { files } : null;
    }

    /**
     * @param {unknown} options
     * @returns {{ types: string[], multiple: boolean }}
     */
    function normalizeOpenOptions(options = {}) {
        const types = Array.isArray(options.types)
            ? options.types.map((t) => String(t)).filter(Boolean)
            : [];
        return {
            types,
            multiple: options.multiple === true,
        };
    }

    /**
     * @param {unknown} options
     * @returns {Promise<{ name: string, mimeType: string, blob: Blob, base64: string }>}
     */
    async function normalizeSaveOptions(options = {}) {
        const name = String(options.name || 'download').trim() || 'download';
        const mimeType = String(options.mimeType || 'application/octet-stream');
        const base64 = await toBase64(options.blob);
        let blob;
        if (options.blob instanceof Blob) {
            blob = options.blob;
        } else {
            blob = blobFromBase64(base64, mimeType);
        }
        return { name, mimeType, blob, base64 };
    }

    ns.files.helpers = {
        blobFromBase64,
        toBase64,
        normalizeOpenedFile,
        normalizeOpenResult,
        normalizeOpenOptions,
        normalizeSaveOptions,
    };
}(window.adaptfully));
