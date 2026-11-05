import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { getRuntimeDir } from '../lib/node/paths.js';
import { buildAdaptfullyInjection, STANDARD_PLUGINS } from '../lib/node/registrations.js';

const runtimeDir = getRuntimeDir();

/**
 * @param {'springroll-host' | 'car-host' | 'noop-host'} pluginKey
 * @param {object} [options]
 */
function loadHostPlugin(pluginKey, options = {}) {
    const plugin = STANDARD_PLUGINS[pluginKey];
    const context = {
        adaptfully: undefined,
        console,
        setTimeout,
        clearTimeout,
        Promise,
        Math,
        JSON,
        window: {
            gameConfig: options.gameConfig || {
                id: 'test-game',
                platform: 'web',
                version: '1.0.0',
            },
            Capacitor: options.Capacitor || undefined,
        },
    };
    context.window.adaptfully = context.adaptfully;

    for (const rel of plugin.scripts) {
        vm.runInNewContext(fs.readFileSync(path.join(runtimeDir, rel), 'utf8'), context);
        if (context.window.adaptfully) {
            context.adaptfully = context.window.adaptfully;
        }
    }

    return context.adaptfully;
}

describe('host registrations', () => {
    it('injects springroll-host registration', () => {
        const injection = buildAdaptfullyInjection({ host: 'springroll-host' });
        assert.match(injection, /adaptfully\.register\('host', adaptfully\.host\.Springroll\(\)\)/);
        assert.match(injection, /registerSpringrollHost/);
    });

    it('injects car-host and noop-host', () => {
        assert.match(
            buildAdaptfullyInjection({ host: 'car-host' }),
            /adaptfully\.host\.Car\(\)/,
        );
        assert.match(
            buildAdaptfullyInjection({ host: 'noop-host' }),
            /adaptfully\.host\.Noop\(\)/,
        );
    });
});

describe('noop-host', () => {
    it('exposes the host contract', async () => {
        const adaptfully = loadHostPlugin('noop-host');
        const host = adaptfully.host.Noop();
        assert.equal(host.kind, 'noop');
        assert.equal(await host.getEnvironment(), 'web');
        const pauses = [];
        host.onPause((v) => pauses.push(v));
        host.setFeatures({ sound: true });
        host.notifyLoaded();
        host.notifyProgress(0.5, { stage: 'assets' });
        host.notifyEndGame();
        host.send('custom', 1);
        assert.equal(JSON.stringify(host._getState().features), JSON.stringify({ sound: true }));
        assert.equal(pauses.length, 0);
    });
});

describe('springroll-host', () => {
    it('forwards notify* and pause via bind(app)', () => {
        const adaptfully = loadHostPlugin('springroll-host');
        const sent = [];
        const pauseSubs = [];
        const app = {
            state: {
                pause: {
                    subscribe(fn) {
                        pauseSubs.push(fn);
                        return () => {
                            const i = pauseSubs.indexOf(fn);
                            if (i >= 0) pauseSubs.splice(i, 1);
                        };
                    },
                },
                soundVolume: { subscribe() { return () => {}; } },
                musicVolume: { subscribe() { return () => {}; } },
                voVolume: { subscribe() { return () => {}; } },
                sfxVolume: { subscribe() { return () => {}; } },
                captionsMuted: { subscribe() { return () => {}; } },
            },
            container: {
                send(event, data) {
                    sent.push({ event, data });
                },
            },
        };

        const host = adaptfully.host.Springroll();
        const pauses = [];
        host.onPause((v) => pauses.push(v));
        host.bind(app);
        host.setFeatures({ captions: true });
        host.notifyLoaded();
        host.notifyProgress(0.25, { stage: 'boot' });
        host.notifyEndGame({ reason: 'win' });

        assert.equal(host.kind, 'springroll');
        assert.ok(pauseSubs.length >= 1);
        pauseSubs[0](true);
        assert.equal(pauses.length, 1);
        assert.equal(pauses[0], true);
        assert.equal(sent[0].event, 'features');
        assert.equal(JSON.stringify(sent[0].data), JSON.stringify({ captions: true }));
        assert.ok(sent.some((e) => e.event === 'loaded'));
        assert.ok(sent.some((e) => e.event === 'progress' && e.data === 0.25));
        assert.ok(sent.some((e) => e.event === 'endGame'));
    });
});

describe('car-host', () => {
    it('reads environment from Cap CarGames plugin', async () => {
        const adaptfully = loadHostPlugin('car-host', {
            Capacitor: {
                Plugins: {
                    CarGames: {
                        getEnvironment: async () => ({ environment: 'android_auto' }),
                        addListener() {
                            return Promise.resolve({ remove() {} });
                        },
                    },
                    App: {
                        addListener() {
                            return Promise.resolve({ remove() {} });
                        },
                    },
                },
            },
        });

        const host = adaptfully.host.Car();
        assert.equal(host.kind, 'car');
        assert.equal(await host.getEnvironment(), 'android_auto');
        host.destroy();
    });

    it('maps App pause listener to onPause', async () => {
        /** @type {Record<string, Function>} */
        const appHandlers = {};
        const adaptfully = loadHostPlugin('car-host', {
            Capacitor: {
                Plugins: {
                    App: {
                        addListener(event, cb) {
                            appHandlers[event] = cb;
                            return Promise.resolve({ remove() {} });
                        },
                    },
                },
            },
        });

        const host = adaptfully.host.Car();
        const pauses = [];
        host.onPause((v) => pauses.push(v));
        appHandlers.pause?.();
        appHandlers.resume?.();
        assert.deepEqual(pauses.filter((v, i) => i === 0 || v !== pauses[i - 1]), [false, true, false]);
        host.destroy();
    });
});
