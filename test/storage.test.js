import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';
import { resolveRegistrationAssets, STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

function loadStoragePlugin(pluginKey) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const context = {
        adaptfully: undefined,
        console,
        localStorage: {
            data: {},
            getItem(k) { return this.data[k] ?? null; },
            setItem(k, v) { this.data[k] = v; },
            removeItem(k) { delete this.data[k]; },
        },
        indexedDB: {
            open(name) {
                const db = {
                    objectStoreNames: { contains: () => false },
                    createObjectStore: () => {},
                    transaction: () => ({
                        objectStore: () => ({
                            get(key) {
                                return { onsuccess: null, onerror: null, result: db.data?.[key] };
                            },
                            put(value, key) {
                                db.data = db.data || {};
                                db.data[key] = value;
                                return { onsuccess: null, onerror: null };
                            },
                            delete(key) {
                                if (db.data) delete db.data[key];
                                return { onsuccess: null, onerror: null };
                            },
                        }),
                    }),
                    data: {},
                };
                const request = {
                    result: db,
                    onsuccess: null,
                    onerror: null,
                    onupgradeneeded: null,
                };
                queueMicrotask(() => {
                    request.onupgradeneeded?.({ target: request });
                    request.onsuccess?.({ target: request });
                });
                return request;
            },
        },
        window: {},
        setTimeout,
        clearTimeout,
    };
    context.window.adaptfully = context.adaptfully;
    context.window.localStorage = context.localStorage;
    context.window.indexedDB = context.indexedDB;

    for (const rel of plugin.scripts) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    vm.runInNewContext(`adaptfully.register('storage', adaptfully.storage.${pluginKey === 'localStorage' ? 'LocalStorage' : 'IndexedDB'}());`, context);
    return context.adaptfully.get('storage');
}

describe('storage plugins', () => {
    it('exposes localStorage and indexedDB plugin keys', () => {
        assert.ok(STANDARD_PLUGINS.localStorage);
        assert.ok(STANDARD_PLUGINS.indexedDB);
    });

    it('localStorage plugin matches sync get/set/remove semantics', () => {
        const storage = loadStoragePlugin('localStorage');
        assert.equal(storage.get('missing'), false);
        storage.set('playerName', 'Ada');
        assert.equal(storage.get('playerName'), 'Ada');
        storage.remove('playerName');
        assert.equal(storage.get('playerName'), false);
        storage.setObject('state', { level: 2 });
        assert.equal(storage.getObject('state').level, 2);
    });

    it('resolveRegistrationAssets registers localStorage inline', () => {
        const assets = resolveRegistrationAssets({ storage: 'localStorage' });
        assert.match(assets.inlineScript, /adaptfully\.storage\.LocalStorage\(\)/);
    });
});
