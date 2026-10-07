import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

function createWebStorage() {
    return {
        data: {},
        getItem(k) { return Object.hasOwn(this.data, k) ? this.data[k] : null; },
        setItem(k, v) { this.data[k] = String(v); },
        removeItem(k) { delete this.data[k]; },
    };
}

function loadGoogleAuthContext(storageData = {}, config = {}, options = {}) {
    const storage = {
        data: { ...storageData },
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };

    let tokenPrompt = '';
    let initClientId = '';
    const errors = [];
    const localStorage = options.localStorage || createWebStorage();
    const sessionStorage = options.sessionStorage || createWebStorage();
    if (options.seedLocalToken) {
        localStorage.setItem(options.seedLocalToken.key, options.seedLocalToken.value);
    }
    if (options.seedSessionToken) {
        sessionStorage.setItem(options.seedSessionToken.key, options.seedSessionToken.value);
    }

    const google = {
        accounts: {
            oauth2: {
                initTokenClient({ client_id }) {
                    initClientId = client_id;
                    return {
                        callback: null,
                        requestAccessToken({ prompt }) {
                            tokenPrompt = prompt;
                            if (typeof options.onRequestAccessToken === 'function') {
                                options.onRequestAccessToken(this, prompt);
                                return;
                            }
                            this.callback({ error: 'no_session' });
                        },
                        revoke(_token, done) {
                            if (typeof done === 'function') {
                                done();
                            }
                        },
                    };
                },
            },
        },
    };

    const context = {
        adaptfully: undefined,
        console: {
            ...console,
            error(...args) {
                errors.push(args.map(String).join(' '));
            },
        },
        localStorage,
        sessionStorage,
        window: {
            setInterval: (fn) => { fn(); return 0; },
            clearInterval: () => {},
        },
        google,
        fetch: options.fetch || (() => Promise.reject(new Error('fetch unavailable in test'))),
        setTimeout,
        clearTimeout,
    };
    context.window.adaptfully = context.adaptfully;
    context.window.google = google;
    context.window.localStorage = localStorage;
    context.window.sessionStorage = sessionStorage;

    for (const rel of ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/google-auth.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    context.adaptfully.register('config', {
        googleClientId: 'test-gis.apps.googleusercontent.com',
        googleTokenKey: 'entanglement_google_token',
        autoLoginStorageKey: 'lastLoggedIn',
        ...config,
    });
    vm.runInNewContext("adaptfully.register('auth', adaptfully.auth.Google);", context);

    return {
        platform: context.adaptfully.get('auth'),
        localStorage,
        sessionStorage,
        getTokenPrompt: () => tokenPrompt,
        getInitClientId: () => initClientId,
        getErrors: () => errors,
    };
}

describe('google auth', () => {
    it('marks platform offline when config.googleClientId is missing', () => {
        const { platform, getInitClientId, getErrors } = loadGoogleAuthContext({}, { googleClientId: '' });

        assert.equal(platform.online, false);
        assert.equal(getInitClientId(), '');
        assert.match(getErrors().join('\n'), /googleClientId/);
    });

    it('initializes GIS with config.googleClientId', () => {
        const { platform, getInitClientId } = loadGoogleAuthContext();

        assert.equal(platform.online, true);
        assert.equal(getInitClientId(), 'test-gis.apps.googleusercontent.com');
    });

    it('autoLogin requests a silent token when lastLoggedIn is persisted', () => {
        const { platform, getTokenPrompt } = loadGoogleAuthContext({ lastLoggedIn: 'player-123' });
        let called = false;

        platform.autoLogin((result) => {
            called = true;
            assert.equal(getTokenPrompt(), 'none');
            assert.equal(result.authenticated, false);
        });
        assert.equal(called, true);
    });

    it('autoLogin skips token request when lastLoggedIn is absent', () => {
        const { platform, getTokenPrompt } = loadGoogleAuthContext({});
        let called = false;

        platform.autoLogin((result) => {
            called = true;
            assert.equal(getTokenPrompt(), '');
            assert.equal(result.authenticated, false);
        });
        assert.equal(called, true);
    });

    it('stores the access token in localStorage by default', async () => {
        const { platform, localStorage, sessionStorage } = loadGoogleAuthContext(
            { lastLoggedIn: 'player-123' },
            {},
            {
                onRequestAccessToken(client) {
                    client.callback({ access_token: 'tok-abc' });
                },
                fetch: () => Promise.resolve({
                    ok: true,
                    json: async () => ({ sub: 'player-123', email: 'p@example.com' }),
                }),
            },
        );

        await new Promise((resolve) => {
            platform.login((result) => {
                assert.equal(result.authenticated, true);
                resolve();
            });
        });

        assert.equal(localStorage.getItem('entanglement_google_token'), 'tok-abc');
        assert.equal(sessionStorage.getItem('entanglement_google_token'), null);
    });

    it('migrates a legacy sessionStorage token into localStorage', async () => {
        const { platform, localStorage, sessionStorage } = loadGoogleAuthContext(
            { lastLoggedIn: 'player-123' },
            {},
            {
                seedSessionToken: {
                    key: 'entanglement_google_token',
                    value: 'legacy-tok',
                },
                fetch: () => Promise.resolve({
                    ok: true,
                    json: async () => ({ sub: 'player-123', email: 'p@example.com' }),
                }),
            },
        );

        await new Promise((resolve) => {
            platform.autoLogin((result) => {
                assert.equal(result.authenticated, true);
                resolve();
            });
        });

        assert.equal(localStorage.getItem('entanglement_google_token'), 'legacy-tok');
        assert.equal(sessionStorage.getItem('entanglement_google_token'), null);
    });

    it('honors googleTokenStorage=sessionStorage', async () => {
        const { platform, localStorage, sessionStorage } = loadGoogleAuthContext(
            { lastLoggedIn: 'player-123' },
            { googleTokenStorage: 'sessionStorage' },
            {
                onRequestAccessToken(client) {
                    client.callback({ access_token: 'sess-tok' });
                },
                fetch: () => Promise.resolve({
                    ok: true,
                    json: async () => ({ sub: 'player-123', email: 'p@example.com' }),
                }),
            },
        );

        await new Promise((resolve) => {
            platform.login((result) => {
                assert.equal(result.authenticated, true);
                resolve();
            });
        });

        assert.equal(sessionStorage.getItem('entanglement_google_token'), 'sess-tok');
        assert.equal(localStorage.getItem('entanglement_google_token'), null);
    });
});
