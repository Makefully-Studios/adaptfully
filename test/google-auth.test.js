import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

function loadGoogleAuthContext(storageData = {}, config = {}) {
    const storage = {
        data: { ...storageData },
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };

    let tokenPrompt = '';
    let initClientId = '';
    const errors = [];

    const google = {
        accounts: {
            oauth2: {
                initTokenClient({ client_id }) {
                    initClientId = client_id;
                    return {
                        callback: null,
                        requestAccessToken({ prompt }) {
                            tokenPrompt = prompt;
                            this.callback({ error: 'no_session' });
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
        sessionStorage: {
            data: {},
            getItem(k) { return this.data[k] ?? null; },
            setItem(k, v) { this.data[k] = v; },
            removeItem(k) { delete this.data[k]; },
        },
        window: {
            setInterval: (fn) => { fn(); return 0; },
            clearInterval: () => {},
        },
        google,
        fetch: () => Promise.reject(new Error('fetch unavailable in test')),
        setTimeout,
        clearTimeout,
    };
    context.window.adaptfully = context.adaptfully;
    context.window.google = google;

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
});
