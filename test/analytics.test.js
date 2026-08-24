import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';
import { resolveRegistrationAssets, STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

/**
 * @param {'http-analytics' | 'noop-analytics'} pluginKey
 * @param {object} [options]
 */
function loadAnalyticsPlugin(pluginKey, options = {}) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const posts = [];
    const context = {
        adaptfully: undefined,
        console,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        JSON,
        Blob: class Blob {
            constructor(parts) {
                this.parts = parts;
            }
        },
        fetch(url, init) {
            posts.push({url, body: init?.body, via: 'fetch'});
            return Promise.resolve({ok: true});
        },
        navigator: {
            sendBeacon(url, blob) {
                posts.push({url, body: blob?.parts?.[0], via: 'beacon'});
                return options.beaconFails ? false : true;
            },
        },
        localStorage: {
            data: {},
            getItem(k) { return this.data[k] ?? null; },
            setItem(k, v) { this.data[k] = String(v); },
            removeItem(k) { delete this.data[k]; },
        },
        window: {
            gameConfig: options.gameConfig || {
                id: 'test-game',
                platform: 'web',
                version: '1.2.3',
            },
        },
        crypto: {
            randomUUID: () => 'session-test-id',
        },
    };
    context.window.adaptfully = context.adaptfully;
    context.window.localStorage = context.localStorage;
    context.window.gameConfig = context.window.gameConfig;

    for (const rel of plugin.scripts) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    // storage for opt-out persistence
    vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, 'storage/_helpers.js'), 'utf8'), context);
    vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, 'storage/local-storage.js'), 'utf8'), context);
    if (context.window.adaptfully) {
        context.adaptfully = context.window.adaptfully;
    }
    vm.runInNewContext(
        `adaptfully.register('storage', adaptfully.storage.LocalStorage());
         adaptfully.register('config', ${JSON.stringify(options.config || {
             analyticsEndpoint: 'https://example.test/analytics',
             analyticsGameId: 'entanglement',
         })});
         adaptfully.register('analytics', adaptfully.analytics.${pluginKey === 'http-analytics' ? 'Http' : 'Noop'}());`,
        context,
    );

    return {
        analytics: context.adaptfully.get('analytics'),
        posts,
        adaptfully: context.adaptfully,
        flushPending() {
            // Run pending timers so HTTP batches flush in tests.
            // node:test vm setTimeout still uses real timers — call flush if available.
            if (typeof context.adaptfully.get('analytics').flush === 'function') {
                context.adaptfully.get('analytics').flush();
            }
        },
    };
}

describe('analytics plugins', () => {
    it('exposes http-analytics and noop-analytics plugin keys', () => {
        assert.ok(STANDARD_PLUGINS['http-analytics']);
        assert.ok(STANDARD_PLUGINS['noop-analytics']);
    });

    it('resolveRegistrationAssets registers http-analytics inline', () => {
        const assets = resolveRegistrationAssets({analytics: 'http-analytics'});
        assert.match(assets.inlineScript, /adaptfully\.analytics\.Http\(\)/);
        assert.ok(assets.runtimeScriptPaths.some((p) => p.replace(/\\/g, '/').endsWith('analytics/http.js')));
    });

    it('noop analytics accepts track/identify without network', () => {
        const {analytics, posts} = loadAnalyticsPlugin('noop-analytics');
        analytics.identify('user-1');
        analytics.setContext({channel: 'dev'});
        analytics.track('game_start', {mapId: 1});
        assert.equal(posts.length, 0);
        assert.equal(analytics._getState().userId, 'user-1');
        assert.equal(analytics._getState().context.channel, 'dev');
    });

    it('http analytics batches events to the configured endpoint', () => {
        const {analytics, posts, flushPending} = loadAnalyticsPlugin('http-analytics');
        analytics.identify('acct-42');
        analytics.setContext({channel: 'web'});
        analytics.track('app_open', {version: '1.2.3'});
        analytics.track('game_start', {mapId: 28, players: 1});
        flushPending();
        assert.equal(posts.length, 1);
        const body = JSON.parse(posts[0].body);
        assert.equal(body.game, 'entanglement');
        assert.equal(body.platform, 'web');
        assert.equal(body.userId, 'acct-42');
        assert.equal(body.events.length, 2);
        assert.equal(body.events[0].name, 'app_open');
        assert.equal(body.events[1].props.mapId, 28);
        assert.equal(body.events[1].props.channel, 'web');
        assert.equal(body.events[1].props.sessionId, 'session-test-id');
    });

    it('http analytics drops events when opted out', () => {
        const {analytics, posts, flushPending} = loadAnalyticsPlugin('http-analytics');
        analytics.optOut();
        analytics.track('game_start', {mapId: 1});
        flushPending();
        assert.equal(posts.length, 0);
        assert.equal(analytics.isOptedOut(), true);
        analytics.optIn();
        analytics.track('game_start', {mapId: 2});
        flushPending();
        assert.equal(posts.length, 1);
    });

    it('http analytics is disabled without an endpoint', () => {
        const {analytics, posts, flushPending} = loadAnalyticsPlugin('http-analytics', {
            config: {analyticsGameId: 'entanglement'},
        });
        analytics.track('app_open');
        flushPending();
        assert.equal(posts.length, 0);
    });

    it('sanitizes non-primitive props', () => {
        const {analytics, posts, flushPending} = loadAnalyticsPlugin('http-analytics');
        analytics.track('client_error', {
            code: 'api',
            nested: {a: 1},
            ok: true,
        });
        flushPending();
        const props = JSON.parse(posts[0].body).events[0].props;
        assert.equal(props.code, 'api');
        assert.equal(props.ok, true);
        assert.equal(props.nested, undefined);
    });
});
