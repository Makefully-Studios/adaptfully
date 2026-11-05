/* global window */

/**
 * Shared helpers for Adaptfully host adapters (SpringRoll, Cap car shell, noop).
 *
 * Host contract (stable surface games should prefer over raw SpringRoll / Cap plugins):
 *   kind, getEnvironment(), onPause(cb), onCaptionsMuted?(cb), onVolume?(ch, cb),
 *   onUxRestrictions?(cb), setFeatures(features), notifyLoaded(), notifyProgress(p, detail?),
 *   notifyEndGame?(payload?), send(event, data?)
 */
(function registerHostHelpers(ns) {
    ns.host = ns.host || {};

    /**
     * @param {Array<(value: unknown) => void>} listeners
     * @param {unknown} value
     */
    function emit(listeners, value) {
        for (const listener of [...listeners]) {
            try {
                listener(value);
            } catch (err) {
                console.warn('adaptfully.host listener error', err);
            }
        }
    }

    /**
     * @param {Array<(value: unknown) => void>} listeners
     * @param {(value: unknown) => void} cb
     * @returns {() => void}
     */
    function subscribe(listeners, cb) {
        if (typeof cb !== 'function') {
            return () => {};
        }
        listeners.push(cb);
        return () => {
            const index = listeners.indexOf(cb);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
        };
    }

    /**
     * Subscribe to a SpringRoll-style Property (`subscribe` → unsubscribe handle).
     * @param {{ subscribe?: (fn: (v: unknown) => void) => unknown } | null | undefined} prop
     * @param {(v: unknown) => void} fn
     * @returns {() => void}
     */
    function subscribeProperty(prop, fn) {
        if (!prop || typeof prop.subscribe !== 'function') {
            return () => {};
        }
        const result = prop.subscribe(fn);
        if (typeof result === 'function') {
            return result;
        }
        if (result && typeof result.unsubscribe === 'function') {
            return () => result.unsubscribe();
        }
        return () => {};
    }

    /**
     * @returns {string}
     */
    function environmentFromGameConfig() {
        try {
            const platform = window.gameConfig?.platform;
            if (platform != null && String(platform).length > 0) {
                return String(platform);
            }
        } catch {
            // ignore
        }
        return 'web';
    }

    ns.host.helpers = {
        emit,
        subscribe,
        subscribeProperty,
        environmentFromGameConfig,
    };
}(window.adaptfully));
