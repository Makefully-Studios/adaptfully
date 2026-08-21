import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';

const runtimeDir = getRuntimeDir();

/**
 * @param {string[]} authScripts relative to runtimeDir under auth/
 * @param {string} registerExpr e.g. "adaptfully.register('auth', adaptfully.auth.Google);"
 */
function loadPlatform(authScripts, registerExpr) {
    const storage = {
        data: {},
        get(key) { return this.data[key]; },
        set(key, value) { this.data[key] = value; },
        remove(key) { delete this.data[key]; },
    };

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
            setTimeout,
            clearTimeout,
        },
        google: {
            accounts: {
                oauth2: {
                    initTokenClient() {
                        return {
                            callback: null,
                            requestAccessToken() {
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

    const scripts = ['core.js', 'platform.js', 'auth/_helpers.js', ...authScripts.map((s) => `auth/${s}`)];
    for (const rel of scripts) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    context.adaptfully.register('config', {});
    vm.runInNewContext(registerExpr, context);

    return context.adaptfully.get('auth');
}

describe('auth capabilities', () => {
    it('google supports logout and requires email', () => {
        const platform = loadPlatform(
            ['google-auth.js'],
            "adaptfully.register('auth', adaptfully.auth.Google);",
        );
        assert.equal(platform.supportsLogout(), true);
        assert.equal(platform.requiresEmail(), true);
        assert.equal(platform.supportsAutoLogin(), true);
    });

    it('steam does not support logout and does not require email', () => {
        const platform = loadPlatform(
            ['steam-auth.js'],
            "adaptfully.register('auth', adaptfully.auth.Steam);",
        );
        assert.equal(platform.supportsLogout(), false);
        assert.equal(platform.requiresEmail(), false);
        assert.equal(platform.supportsAutoLogin(), true);
    });

    it('social supports logout and requires email', () => {
        const platform = loadPlatform(
            ['social-auth.js'],
            "adaptfully.register('auth', adaptfully.auth.Social);",
        );
        assert.equal(platform.supportsLogout(), true);
        assert.equal(platform.requiresEmail(), true);
    });

    it('dev supports logout and requires email', () => {
        const platform = loadPlatform(
            ['dev-auth.js'],
            "adaptfully.register('auth', adaptfully.auth.Dev);",
        );
        assert.equal(platform.supportsLogout(), true);
        assert.equal(platform.requiresEmail(), true);
    });

    it('Platform defaults: missing supportsLogout → false; missing requiresEmail → true', () => {
        const context = {
            adaptfully: undefined,
            console,
            window: {},
        };
        context.window.adaptfully = context.adaptfully;

        for (const rel of ['core.js', 'platform.js', 'auth/_helpers.js']) {
            vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
            if (context.window.adaptfully) {
                context.adaptfully = context.window.adaptfully;
            }
        }

        const stub = {
            name: 'stub',
            whenReady(done) { done(); },
            login(cb) { cb({ authenticated: false }); },
            autoLogin(cb) { cb({ authenticated: false }); },
            logout(cb) { cb(); },
            getUser() { return null; },
            isAuthenticated() { return false; },
        };
        context.adaptfully.register('auth', () => stub);
        const platform = context.adaptfully.get('auth');

        assert.equal(platform.supportsLogout(), false);
        assert.equal(platform.requiresEmail(), true);
    });
});
