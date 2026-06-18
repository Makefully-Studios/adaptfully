/* global window */

/**
 * Adaptfully — shared platform services for Makefully games.
 *
 *   adaptfully.register('auth', adaptfully.auth.Google);
 *   const platform = adaptfully.get('auth');
 */
(function initAdaptfully(global) {
    class Adaptfully {
        /** @type {Record<string, unknown>} */
        #registry = {};

        /** @type {import('./platform.js').Platform | null} */
        #authPlatform = null;

        register(key, value) {
            if (key === 'auth') {
                this.#authPlatform = null;
            }
            this.#registry[key] = value;
        }

        get(key) {
            if (key === 'auth') {
                if (!this.#authPlatform) {
                    const factory = this.#registry.auth;
                    if (!factory) {
                        throw new Error(
                            'adaptfully: no auth registered — call adaptfully.register(\'auth\', ...) before the game loads',
                        );
                    }
                    const plugin = typeof factory === 'function' ? factory() : factory;
                    if (!this.Platform) {
                        throw new Error('adaptfully: Platform is not loaded');
                    }
                    this.#authPlatform = new this.Platform(plugin);
                }
                return this.#authPlatform;
            }

            if (!(key in this.#registry)) {
                throw new Error(`adaptfully: nothing registered for "${key}"`);
            }
            return this.#registry[key];
        }

        has(key) {
            return key in this.#registry;
        }
    }

    const adaptfully = global.adaptfully || new Adaptfully();
    adaptfully.auth = adaptfully.auth || {};
    global.adaptfully = adaptfully;
}(typeof window !== 'undefined' ? window : globalThis));
