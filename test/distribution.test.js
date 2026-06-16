import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
    authRegistrationForChannel,
    devAuthRegistration,
    extScriptsForBuildChannel,
    filterIncludesForBuildChannel,
    getAuthScriptsForChannel,
    getBuildChannel,
} from '../lib/node/distribution.js';

describe('distribution', () => {
    it('defaults to web channel', () => {
        assert.equal(getBuildChannel({}), 'web');
    });

    it('selects google auth registration for web', () => {
        assert.match(authRegistrationForChannel('web'), /adaptfully\.auth\.Google/);
    });

    it('selects steam auth registration for steam', () => {
        assert.match(authRegistrationForChannel('steam'), /adaptfully\.auth\.Steam/);
    });

    it('omits steam auth script for web builds', () => {
        const scripts = getAuthScriptsForChannel('web');
        assert.ok(scripts.some((p) => p.endsWith('google-auth.js')));
        assert.ok(!scripts.some((p) => p.endsWith('steam-auth.js')));
    });

    it('omits google auth script for steam builds', () => {
        const scripts = getAuthScriptsForChannel('steam');
        assert.ok(scripts.some((p) => p.endsWith('steam-auth.js')));
        assert.ok(!scripts.some((p) => p.endsWith('google-auth.js')));
    });

    it('drops banner-ads for steam channel includes', () => {
        const includes = ['script/banner-ads.js', 'script/main.js'];
        assert.deepEqual(filterIncludesForBuildChannel(includes, 'steam'), ['script/main.js']);
    });

    it('injects Google Identity Services for web', () => {
        assert.match(extScriptsForBuildChannel('web'), /accounts\.google\.com\/gsi\/client/);
    });

    it('provides dev auth registration', () => {
        assert.match(devAuthRegistration(), /adaptfully\.auth\.Dev/);
    });
});

function loadRuntime(channel) {
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
            getItem(k) { return this.data[k] || null; },
            setItem(k, v) { this.data[k] = v; },
            removeItem(k) { delete this.data[k]; },
        },
        window: {
            setInterval: (fn) => { fn(); return 0; },
            clearInterval: () => {},
        },
        google: undefined,
        setTimeout,
        clearTimeout,
        fetch: () => Promise.reject(new Error('fetch unavailable in test')),
    };

    for (const scriptPath of getAuthScriptsForChannel(channel)) {
        vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    context.adaptfully.register('storage', storage);
    vm.runInNewContext(authRegistrationForChannel(channel), context);

    return context.adaptfully;
}

describe('runtime auth', () => {
    it('returns a google platform for web builds', () => {
        const adaptfully = loadRuntime('web');
        const platform = adaptfully.get('auth');
        assert.equal(platform.auth.name, 'google');
    });

    it('returns a steam platform for steam builds', () => {
        const adaptfully = loadRuntime('steam');
        const platform = adaptfully.get('auth');
        assert.equal(platform.auth.name, 'steam');
    });

    it('caches a single auth platform instance', () => {
        const adaptfully = loadRuntime('web');
        assert.equal(adaptfully.get('auth'), adaptfully.get('auth'));
    });

    it('steam silent login starts unauthenticated', () => {
        const adaptfully = loadRuntime('steam');
        const platform = adaptfully.get('auth');
        platform.silentLogin((result) => {
            assert.equal(result.authenticated, false);
        });
    });
});
