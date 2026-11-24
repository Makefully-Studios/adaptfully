/* global window */

/**
 * No-op files — open/save always return null.
 */
(function registerNoopFiles(ns) {
    ns.files.Noop = function noopFilesFactory() {
        return {
            name: 'noop',

            async open() {
                return null;
            },

            async save() {
                return null;
            },
        };
    };
}(window.adaptfully));
