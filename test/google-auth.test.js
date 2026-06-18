import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

function loadGoogleAuthContext(storageData = {}) {
    const storage = {
        data: { ...storageData },
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };

    let tokenPrompt = '';
    const context = {
        adaptfully: undefined,
        console,
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
        google: {
            accounts: {
                oauth2: {
                    initTokenClient() {
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
        },
        fetch: () => Promise.reject(new Error('fetch unavailable in test')),
        setTimeout,
        clearTimeout,
    };
    context.window.adaptfully = context.adaptfully;

    for (const rel of ['core.js', 'platform.js', 'auth/_helpers.js', 'auth/google-auth.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    context.adaptfully.register('config', {
        googleTokenKey: 'entanglement_google_token',
        autoLoginStorageKey: 'lastLoggedIn',
    });
    vm.runInNewContext("adaptfully.register('auth', adaptfully.auth.Google);", context);

    return { context, getTokenPrompt: () => tokenPrompt };
}

describe('google auth', () => {
    it('autoLogin requests a silent token when lastLoggedIn is persisted', () => {
        const { context, getTokenPrompt } = loadGoogleAuthContext({ lastLoggedIn: 'player-123' });
        const platform = context.adaptfully.get('auth');

        platform.autoLogin((result) => {
            assert.equal(getTokenPrompt(), 'none');
            assert.equal(result.authenticated, false);
        });
    });

    it('autoLogin skips token request when lastLoggedIn is absent', () => {
        const { context, getTokenPrompt } = loadGoogleAuthContext({});
        const platform = context.adaptfully.get('auth');

        platform.autoLogin((result) => {
            assert.equal(getTokenPrompt(), '');
            assert.equal(result.authenticated, false);
        });
    });
});
